import SwiftUI
import WidgetKit

struct ScheduleEntry: TimelineEntry {
    let date: Date
    let group: String
    let schedule: WidgetSchedule.Snapshot?

    let today: String
    let todayLessons: [WidgetSchedule.Lesson]
    let next: WidgetSchedule.Lesson?

    init(date: Date, group: String, schedule: WidgetSchedule.Snapshot?) {
        self.date = date
        self.group = group
        self.schedule = schedule
        let day = WidgetSchedule.day(date)
        self.today = day
        let lessons = (schedule?.groups[group] ?? []).filter { $0.date >= day && !$0.title.isEmpty && $0.interval != nil }
            .sorted { ($0.date, $0.start, $0.end, $0.id) < ($1.date, $1.start, $1.end, $1.id) }
        self.todayLessons = lessons.filter { $0.date == day }
        self.next = lessons.first { ($0.endsAt ?? .distantPast) > date }
    }
    var activeLesson: WidgetSchedule.Lesson? {
        guard let next, let start = next.startsAt, start <= date else { return nil }
        return next
    }
    private var previousEnd: Date? {
        todayLessons.compactMap(\.endsAt).filter { $0 <= date }.max()
    }
    var isBreak: Bool { next?.date == today && activeLesson == nil && previousEnd != nil }

    var countdown: ClosedRange<Date>? {
        guard let lesson = next, let slot = lesson.interval else { return nil }
        if slot.lowerBound <= date { return slot }
        guard lesson.date == today else { return nil }
        return (previousEnd ?? WidgetSchedule.midnight(date))...slot.lowerBound
    }
    var timerInterval: ClosedRange<Date>? {
        if let countdown { return countdown }
        guard let start = next?.startsAt, start > date else { return nil }
        return date...start
    }
    var emptyMessage: String {
        schedule?.covers(today, group: group) == true ? "На сегодня пар нет" : "Расписание недоступно"
    }
}

struct ScheduleProvider: TimelineProvider {
    var legacyRingSnapshots = false

    func placeholder(in context: Context) -> ScheduleEntry {
        ScheduleEntry(date: Date(), group: WidgetSchedule.group, schedule: WidgetSchedule.current())
    }

    func getSnapshot(in context: Context, completion: @escaping (ScheduleEntry) -> Void) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ScheduleEntry>) -> Void) {
        Task {
            let schedule = await WidgetSchedule.refresh()
            let now = Date()
            let group = WidgetSchedule.group
            let midnight = WidgetSchedule.midnight(now, next: true)
            let refresh = min(now.addingTimeInterval(60 * 60), midnight)
            // Keep the cached timeline usable even if WidgetKit delays the next network refresh.
            let horizon = WidgetSchedule.midnight(midnight, next: true)
            let days = [WidgetSchedule.day(now), WidgetSchedule.day(midnight)]
            let lessons = (schedule?.groups[group] ?? []).filter { days.contains($0.date) }
            var changes = lessons.compactMap(\.interval).flatMap { [$0.lowerBound, $0.upperBound] }
                .filter { now < $0 && $0 < horizon }
            if #unavailable(iOSApplicationExtension 16.0), legacyRingSnapshots,
               let deadline = ScheduleEntry(date: now, group: group, schedule: schedule).countdown?.upperBound {
                let end = min(refresh, deadline)
                for offset in stride(from: 5 * 60, to: Int(end.timeIntervalSince(now)), by: 5 * 60) {
                    changes.append(now.addingTimeInterval(Double(offset)))
                }
            }
            let entries = ([now] + Set(changes + [midnight]).sorted()).map {
                ScheduleEntry(date: $0, group: group, schedule: schedule)
            }
            completion(Timeline(entries: entries, policy: .after(refresh)))
        }
    }
}

struct WidgetCountdownText: View {
    let interval: ClosedRange<Date>?
    let fallback: String

    var body: some View {
        if let interval, interval.lowerBound < interval.upperBound {
            if #available(iOSApplicationExtension 18.0, *) {
                Text(.currentDate, format: .timer(countingDownIn: interval.lowerBound..<interval.upperBound))
                    .lineLimit(1)
            } else if #available(iOSApplicationExtension 16.0, *) {
                Text(timerInterval: interval, countsDown: true, showsHours: true)
                    .lineLimit(1)
            } else {
                Text(interval.upperBound, style: .timer).lineLimit(1)
            }
        } else {
            Text(fallback)
        }
    }
}

private enum WidgetLink {
    static func schedule(_ date: String) -> URL { URL(string: "siriuswiki://schedule?date=" + date)! }
    static let account = URL(string: "siriuswiki://account")!
    static let review = URL(string: "siriuswiki://review")!
}

private extension View {
    @ViewBuilder func widgetGlass() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(for: .widget) { Rectangle().fill(.ultraThinMaterial) }
        } else {
            padding(14).background(.ultraThinMaterial)
        }
    }

    @ViewBuilder func widgetAccent() -> some View {
        if #available(iOSApplicationExtension 16.0, *) { widgetAccentable() }
        else { self }
    }
}

private struct WidgetAccentColor: EnvironmentKey {
    static let defaultValue = Color.accentColor
}

private extension EnvironmentValues {
    var siriusWidgetAccent: Color {
        get { self[WidgetAccentColor.self] }
        set { self[WidgetAccentColor.self] = newValue }
    }
}

private struct WidgetMaterial<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    let content: Content

    var body: some View {
        let color = colorScheme == .dark ? Color(red: 0.43, green: 0.90, blue: 0.87)
            : Color(red: 0.04, green: 0.37, blue: 0.39)
        if #available(iOSApplicationExtension 16.0, *) {
            RenderingAwareWidget(content: content, color: color).widgetGlass()
        } else {
            content.environment(\.siriusWidgetAccent, color).widgetGlass()
        }
    }
}

@available(iOSApplicationExtension 16.0, *)
private struct RenderingAwareWidget<Content: View>: View {
    @Environment(\.widgetRenderingMode) private var mode
    let content: Content
    let color: Color

    var body: some View {
        content.environment(\.siriusWidgetAccent, mode == .fullColor ? color : .primary)
    }
}

private struct ScheduleWidgetView: View {
    @Environment(\.siriusWidgetAccent) private var accent
    let entry: ScheduleEntry
    let size: WidgetFamily


    var body: some View {
        content
    }

    private var content: some View {
        Group {
            if size == .systemSmall {
                compact.widgetURL(WidgetLink.schedule(entry.next?.date ?? entry.today))
            } else {
                agenda.widgetURL(WidgetLink.schedule(entry.today))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var compact: some View {
        VStack(alignment: .leading, spacing: 5) {
            Label(lessonStatus, systemImage: "clock")
                .font(.caption.weight(.semibold)).foregroundStyle(accent)
                .widgetAccent()
                .lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 2)
            if let next = entry.next {
                WidgetCountdownText(interval: entry.timerInterval, fallback: entry.activeLesson != nil ? next.end : next.start)
                    .font(.system(.title, design: .rounded).weight(.bold).monospacedDigit())
                    .lineLimit(1).minimumScaleFactor(0.75)
                Text(next.title).font(.subheadline.weight(.semibold)).lineLimit(2).minimumScaleFactor(0.85)
                if let room = next.room, !room.isEmpty {
                    Text(room).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            } else {
                Text(entry.todayLessons.isEmpty ? entry.emptyMessage : "Пары закончились")
                    .font(.subheadline.weight(.semibold)).lineLimit(3)
                Text(entry.group).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var lessonStatus: String {
        guard let lesson = entry.next else { return "Ближайшая пара" }
        if entry.activeLesson != nil { return "До конца · \(lesson.end)" }
        return lesson.date == entry.today ? "До пары · \(lesson.start)" : WidgetSchedule.label(lesson.date)
    }

    private var agenda: some View {
        let countdown = entry.timerInterval
        let limit = size == .systemLarge ? 5 : countdown == nil ? 3 : 2
        let remaining = entry.todayLessons.filter { ($0.endsAt ?? .distantPast) > entry.date }
        let lessons = remaining.isEmpty ? entry.todayLessons : remaining
        return VStack(alignment: .leading, spacing: size == .systemLarge ? 8 : 5) {
            HStack {
                Text(WidgetSchedule.label(entry.today)).font(.headline)
                Spacer(minLength: 8)
                Text(entry.group).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            if let countdown, let next = entry.next {
                HStack(spacing: 5) {
                    Text(entry.activeLesson != nil ? "До конца пары" : "До следующей пары")
                    WidgetCountdownText(interval: countdown, fallback: entry.activeLesson != nil ? next.end : next.start)
                        .monospacedDigit().frame(width: 76, alignment: .leading)
                }
                .font(.caption2.weight(.semibold)).foregroundStyle(accent).lineLimit(1)
            }
            if entry.todayLessons.isEmpty {
                Spacer(minLength: 0)
                Text(entry.emptyMessage).font(.subheadline.weight(.semibold))
                if let next = entry.next {
                    Text("\(WidgetSchedule.label(next.date)) · \(next.start) · \(next.title)")
                        .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer(minLength: 0)
            } else {
                ForEach(lessons.prefix(limit)) { lesson in row(lesson) }
                if lessons.count > limit {
                    Text("Ещё \(lessons.count - limit) · открыть расписание")
                        .font(.caption2).foregroundStyle(accent).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            if size == .systemLarge {
                HStack(spacing: 6) {
                    shortcut("Пары", systemImage: "calendar", url: WidgetLink.schedule(entry.today))
                    shortcut("ЛК", systemImage: "person.crop.circle", url: WidgetLink.account)
                    shortcut("Квизы", systemImage: "checkmark.circle", url: WidgetLink.review)
                }
            }
        }
    }

    private func row(_ lesson: WidgetSchedule.Lesson) -> some View {
        let live = (lesson.startsAt ?? .distantFuture) <= entry.date && entry.date < (lesson.endsAt ?? .distantPast)
        return HStack(spacing: 8) {
            Text(lesson.start).monospacedDigit().fontWeight(.semibold).foregroundStyle(accent)
                .widgetAccent()
            Text(lesson.title).fontWeight(live ? .bold : .regular).lineLimit(1)
            Spacer(minLength: 0)
            if let room = lesson.room, !room.isEmpty {
                Text(room).foregroundStyle(.secondary).lineLimit(1).frame(maxWidth: 68, alignment: .trailing)
            }
        }
        .font(.caption)
        .accessibilityElement(children: .combine)
    }

    private func shortcut(_ name: String, systemImage: String, url: URL) -> some View {
        Link(destination: url) {
            VStack(spacing: 4) {
                Image(systemName: systemImage).font(.system(size: 15, weight: .semibold))
                Text(name).font(.caption.weight(.semibold))
            }
            .frame(maxWidth: .infinity, minHeight: 42)
            .foregroundStyle(accent)
            .background(accent.opacity(0.10), in: RoundedRectangle(cornerRadius: 10))
        }
    }
}

struct SiriusScheduleWidget: Widget {
    let kind = "SiriusScheduleWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ScheduleProvider()) { entry in
            WidgetMaterial(content: FamilyWidgetView(entry: entry))
        }
        .configurationDisplayName("Сириус Wiki")
        .description("Ближайшая пара, расписание на день и учебная панель в трёх размерах.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

private struct FamilyWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ScheduleEntry

    var body: some View { ScheduleWidgetView(entry: entry, size: family) }
}

private struct LessonCountdownView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.siriusWidgetAccent) private var accent
    @Environment(\.colorScheme) private var colorScheme
    let entry: ScheduleEntry

    private var active: WidgetSchedule.Lesson? { entry.activeLesson }
    private var subject: WidgetSchedule.Lesson? { entry.next }
    private var color: Color {
        guard entry.isBreak else { return accent }
        return colorScheme == .dark ? Color(red: 0.6627, green: 0.6196, blue: 0.9020)
            : Color(red: 0.4941, green: 0.4353, blue: 0.7765)
    }
    private var phaseTitle: String {
        if active != nil { return "До конца пары" }
        if entry.isBreak { return "До конца перемены" }
        if entry.countdown != nil { return "До первой пары" }
        return subject == nil ? "Расписание" : "Следующая пара"
    }
    private var ringCaption: String {
        guard let lesson = subject else {
            return entry.schedule?.covers(entry.today, group: entry.group) == true ? "нет пар" : "нет данных"
        }
        if lesson.date == entry.today { return "дальше" }
        let date = lesson.date.split(separator: "-")
        return date.count == 3 ? "\(date[2]).\(date[1])" : "дальше"
    }

    var body: some View {
        Group {
            if #available(iOSApplicationExtension 16.0, *), family == .accessoryCircular {
                ring(size: 55, timerFont: 11, compact: true)
                    .accessibilityElement(children: .combine)
            } else {
                let medium = family == .systemMedium
                HStack(spacing: medium ? 13 : 7) {
                    ring(size: medium ? 77 : 48, timerFont: medium ? 18 : 12)
                    details(medium: medium)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetURL(WidgetLink.schedule(subject?.date ?? entry.today))
    }

    private func details(medium: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(phaseTitle)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(color)
                .lineLimit(2)
                .widgetAccent()
            Text(subject?.title ?? entry.emptyMessage)
                .font(medium ? .subheadline.weight(.semibold) : .caption.weight(.semibold))
                .lineLimit(medium ? 2 : 3)
                .minimumScaleFactor(0.85)
            if let lesson = subject {
                Text(active != nil ? "До \(lesson.end)" :
                     lesson.date == entry.today ? "В \(lesson.start)" :
                     "\(WidgetSchedule.label(lesson.date)) · \(lesson.start)")
                    .font(.caption2).foregroundStyle(.secondary)
                    .lineLimit(medium ? 1 : 2)
                if let room = lesson.room, !room.isEmpty {
                    Text(room).font(.caption2).foregroundStyle(.secondary)
                        .lineLimit(1).truncationMode(.head)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func ring(size: CGFloat, timerFont: CGFloat, compact: Bool = false) -> some View {
        let interval = entry.countdown
        let timer = entry.timerInterval
        let remaining = timer?.upperBound.timeIntervalSince(entry.date) ?? 0
        let scale: CGFloat = remaining >= 100 * 3600 ? 0.65 : remaining >= 10 * 3600 ? 0.72 : remaining >= 3600 ? 0.83 : 1
        let fallback = (active != nil ? subject?.end : subject?.start) ?? "—"
        return ZStack {
            if #available(iOSApplicationExtension 16.0, *), let interval {
                ProgressView(timerInterval: interval, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                    .progressViewStyle(.circular)
                    .tint(color)
                    .widgetAccent()
                    .accessibilityHidden(true)
            } else {
                Circle().strokeBorder(Color.primary.opacity(0.18), lineWidth: size * 0.075)
                if let interval {
                    let duration = interval.upperBound.timeIntervalSince(interval.lowerBound)
                    let remaining = max(0, min(1, interval.upperBound.timeIntervalSince(entry.date) / duration))
                    Circle().trim(from: 0, to: remaining)
                        .stroke(color, style: StrokeStyle(lineWidth: size * 0.075, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .padding(size * 0.0375)
                }
            }
            VStack(spacing: 1) {
                WidgetCountdownText(interval: timer, fallback: "—")
                    .accessibilityHint(phaseTitle)
                if compact {
                    Text(active != nil ? "до \(fallback)" : interval != nil ? "в \(fallback)" : ringCaption)
                        .font(.system(size: 8)).foregroundStyle(.secondary)
                }
            }
            .frame(width: size * 0.84)
        }
        .font(.system(size: timerFont * scale, weight: .semibold, design: .rounded).monospacedDigit())
        .minimumScaleFactor(0.7)
        .multilineTextAlignment(.center)
        .frame(width: size, height: size)
    }
}

private struct LessonCountdownWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SiriusLessonCountdown", provider: ScheduleProvider(legacyRingSnapshots: true)) { entry in
            WidgetMaterial(content: LessonCountdownView(entry: entry))
        }
        .configurationDisplayName("До конца пары")
        .description("Та же круговая диаграмма, что в расписании. Показывает остаток пары, перемены или ожидания первой пары.")
        .supportedFamilies(families)
    }

    private var families: [WidgetFamily] {
        if #available(iOSApplicationExtension 16.0, *) { return [.systemSmall, .systemMedium, .accessoryCircular] }
        return [.systemSmall, .systemMedium]
    }
}

private struct RemainingDayView: View {
    @Environment(\.siriusWidgetAccent) private var accent
    let entry: ScheduleEntry

    var body: some View {
        let remaining = entry.todayLessons.filter { ($0.endsAt ?? .distantPast) > entry.date }
        let count = Set(remaining.map { $0.start + $0.end }).count
        return VStack(alignment: .leading, spacing: 6) {
            Label("Осталось сегодня", systemImage: "calendar")
                .font(.caption.weight(.semibold)).foregroundStyle(accent).widgetAccent().lineLimit(1)
            Spacer(minLength: 0)
            if let finish = remaining.max(by: { $0.end < $1.end }), let deadline = finish.endsAt {
                Text("\(count)").font(.system(.largeTitle, design: .rounded).bold()).monospacedDigit()
                Text(count == 1 ? "пара" : (2...4).contains(count) ? "пары" : "пар")
                    .font(.subheadline.weight(.medium))
                WidgetCountdownText(interval: WidgetSchedule.midnight(entry.date)...deadline, fallback: "До \(finish.end)")
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1).monospacedDigit()
                    .accessibilityHint("До конца учебного дня")
            } else {
                Text(entry.todayLessons.isEmpty ? entry.emptyMessage : "Пары закончились")
                    .font(.subheadline.weight(.semibold)).lineLimit(3)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(WidgetLink.schedule(entry.today))
        .accessibilityElement(children: .combine)
    }
}

private struct RemainingDayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SiriusRemainingDay", provider: ScheduleProvider()) { entry in
            WidgetMaterial(content: RemainingDayView(entry: entry))
        }
        .configurationDisplayName("Осталось сегодня")
        .description("Сколько пар осталось сегодня и во сколько закончится последняя.")
        .supportedFamilies([.systemSmall])
    }
}

@main
struct SiriusWidgets: WidgetBundle {
    var body: some Widget {
        SiriusScheduleWidget()
        LessonCountdownWidget()
        RemainingDayWidget()
        if #available(iOSApplicationExtension 16.2, *) {
            LessonTimerActivity()
        }
    }
}
