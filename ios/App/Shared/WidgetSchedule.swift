import Foundation

enum WidgetSchedule {
    static let groups = ["ИОП-ИТ-26/1", "ИОП-ИТ-26/2", "ИОП-ИТ-25/1", "ИОП-ИТ-25/2", "ИОП-ИТ-24/1", "ИОП-ИТ-24/2"]
    static let zone = TimeZone(identifier: "Europe/Moscow")!
    private static let groupKey = "widget-schedule-group"
    private static let remoteURL = URL(string: "https://arduradiokot.github.io/sirius-it-wiki/data/schedule.json")!
    private static let dateFormat = formatter("yyyy-MM-dd")
    private static let timeFormat = formatter("yyyy-MM-dd HH:mm")
    private static let labelFormat = formatter("d MMMM", locale: "ru_RU")

    struct Snapshot: Decodable {
        let version: Int
        let updatedAt: Date
        let fromDate: String
        let toDate: String
        let groups: [String: [Lesson]]

        func covers(_ day: String, group: String) -> Bool {
            groups[group] != nil && fromDate <= day && day <= toDate
        }

        func timerSlots(group: String, now: Date, horizon: Date) -> [TimerSlot] {
            let lessons = (groups[group] ?? []).sorted { ($0.date, $0.start, $0.end, $0.id) < ($1.date, $1.start, $1.end, $1.id) }
            var slots: [TimerSlot] = []
            for lesson in lessons {
                guard !lesson.title.isEmpty, let start = lesson.startsAt, let end = lesson.endsAt,
                      end > start, end > now, start <= horizon,
                      start >= (slots.last?.end ?? .distantPast) else { continue }
                let key = "\(group)|\(lesson.date)|\(lesson.start)|\(lesson.end)"
                slots.append(TimerSlot(key: key, day: lesson.date, start: start, end: end, title: lesson.title))
            }
            return slots
        }

        func reminders(group: String, lead: Int, now: Date, limit: Int) -> [(lesson: Lesson, fire: Date)] {
            let horizon = now.addingTimeInterval(10 * 24 * 60 * 60)
            let lessons = groups[group] ?? []
            var slots = Set<String>()
            var result: [(lesson: Lesson, fire: Date)] = []
            let sorted = lessons.sorted { ($0.date, $0.end) < ($1.date, $1.end) }
            for lesson in sorted {
                guard result.count < limit else { break }
                guard let start = lesson.startsAt, let end = lesson.endsAt else { continue }
                let fire = end.addingTimeInterval(-Double(lead) * 60)
                let slot = lesson.date + "." + lesson.end
                guard fire > now, fire >= start, fire <= horizon, slots.insert(slot).inserted else { continue }
                result.append((lesson, fire))
            }
            return result
        }
    }

    struct Lesson: Decodable, Identifiable {
        let id: String
        let date: String
        let start: String
        let end: String
        let title: String
        let room: String?

        var startsAt: Date? { timeFormat.date(from: "\(date) \(start)") }
        var endsAt: Date? { timeFormat.date(from: "\(date) \(end)") }
    }

    struct TimerSlot {
        let key: String
        let day: String
        let start: Date
        let end: Date
        let title: String
    }

    private static var groupIdentifier: String? {
        Bundle.main.object(forInfoDictionaryKey: "SiriusWidgetAppGroup") as? String
    }

    private static var container: URL? {
        groupIdentifier.flatMap { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) }
    }

    private static var preferences: UserDefaults {
        guard container != nil, let identifier = groupIdentifier,
              let defaults = UserDefaults(suiteName: identifier) else { return .standard }
        return defaults
    }

    private static var cache: URL? { container?.appendingPathComponent("widget-schedule.json") }

    static var group: String {
        let value = preferences.string(forKey: groupKey) ?? ""
        return groups.contains(value) ? value : groups[0]
    }

    @discardableResult
    static func select(_ value: String) -> Bool {
        guard groups.contains(value), value != group else { return false }
        preferences.set(value, forKey: groupKey)
        return true
    }

    private static func formatter(_ format: String, locale: String = "en_US_POSIX") -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: locale)
        formatter.timeZone = zone
        formatter.dateFormat = format
        return formatter
    }

    static func day(_ date: Date) -> String { dateFormat.string(from: date) }

    static func label(_ day: String) -> String {
        dateFormat.date(from: day).map { labelFormat.string(from: $0) } ?? day
    }

    static func validDay(_ day: String) -> Bool {
        guard let date = dateFormat.date(from: day) else { return false }
        return self.day(date) == day
    }

    static func decode(_ data: Data) -> Snapshot? {
        guard data.count <= 2 * 1024 * 1024 else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { value in
            let container = try value.singleValueContainer()
            let raw = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: raw) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            guard let date = formatter.date(from: raw) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid schedule timestamp")
            }
            return date
        }
        guard let snapshot = try? decoder.decode(Snapshot.self, from: data), snapshot.version == 1,
              validDay(snapshot.fromDate), validDay(snapshot.toDate), snapshot.fromDate <= snapshot.toDate,
              groups.allSatisfy({ snapshot.groups[$0] != nil }) else { return nil }
        return snapshot
    }

    private static func bundled() -> Snapshot? {
        let path = Bundle.main.url(forResource: "schedule", withExtension: "json")
            ?? Bundle.main.resourceURL?.appendingPathComponent("public/data/schedule.json")
        guard let path, let data = try? Data(contentsOf: path) else { return nil }
        return decode(data)
    }

    static func current() -> Snapshot? {
        let bundled = bundled()
        guard let cache, let data = try? Data(contentsOf: cache), let saved = decode(data) else { return bundled }
        return saved.updatedAt >= (bundled?.updatedAt ?? .distantPast) ? saved : bundled
    }

    @discardableResult
    static func save(_ data: Data) -> Bool {
        // The app and extension can both fetch the public schedule, so serialize updates to the shared file.
        guard let cache, let incoming = decode(data) else { return false }
        let coordinator = NSFileCoordinator()
        var coordinationError: NSError?
        var changed = false
        coordinator.coordinate(writingItemAt: cache, options: .forReplacing, error: &coordinationError) { target in
            let old = (try? Data(contentsOf: target)).flatMap(decode) ?? bundled()
            guard incoming.updatedAt > (old?.updatedAt ?? .distantPast) else { return }
            do {
                try data.write(to: target, options: .atomic)
                changed = true
            } catch { return }
        }
        return changed
    }

    static func refresh() async -> Snapshot? {
        let existing = current()
        // Avoid making another request immediately after the app has saved a fresh copy.
        if let cache, let values = try? cache.resourceValues(forKeys: [.contentModificationDateKey]),
           let modified = values.contentModificationDate,
           Date().timeIntervalSince(modified) < 30 * 60 { return existing }
        var request = URLRequest(url: remoteURL)
        request.timeoutInterval = 8
        if let (data, response) = try? await URLSession.shared.data(for: request),
           let http = response as? HTTPURLResponse, http.statusCode == 200,
           http.url == remoteURL, let incoming = decode(data),
           incoming.updatedAt >= (existing?.updatedAt ?? .distantPast) {
            save(data)
            return current() ?? incoming
        }
        return existing
    }
}
