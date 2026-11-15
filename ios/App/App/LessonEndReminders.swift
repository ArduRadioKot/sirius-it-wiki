import Capacitor
import Foundation
import UserNotifications

private let lessonEndNotificationPrefix = "sirius.lesson-end."

@MainActor
final class LessonEndReminders {
    static let shared = LessonEndReminders()
    static let leadOptions = [3, 5, 10]

    private let center = UNUserNotificationCenter.current()
    private let preferences = UserDefaults.standard
    private var planning = false
    private var needsPlan = false

    var enabled: Bool { preferences.bool(forKey: "lesson-end-enabled") }
    var lead: Int {
        let saved = preferences.integer(forKey: "lesson-end-lead")
        return Self.leadOptions.contains(saved) ? saved : 5
    }

    func isEnabled() async -> Bool {
        guard enabled else { return false }
        let status = await center.notificationSettings().authorizationStatus
        return status == .authorized || status == .provisional || status == .ephemeral
    }

    func configure(enabled: Bool, lead: Int) async throws -> Bool {
        if enabled, await !isEnabled() {
            guard try await center.requestAuthorization(options: [.alert, .sound]) else { return false }
        }
        preferences.set(enabled, forKey: "lesson-end-enabled")
        preferences.set(Self.leadOptions.contains(lead) ? lead : 5, forKey: "lesson-end-lead")
        await replan()
        return true
    }

    func replan() async {
        needsPlan = true
        guard !planning else { return }
        planning = true
        defer { planning = false }
        while needsPlan {
            needsPlan = false
            await applyPlan()
        }
    }

    private func applyPlan() async {
        let pending = await center.pendingNotificationRequests()

        let existing = pending.filter { $0.identifier.hasPrefix(lessonEndNotificationPrefix) }
        guard await isEnabled(), let schedule = WidgetSchedule.current() else {
            center.removePendingNotificationRequests(withIdentifiers: existing.map(\.identifier))
            return
        }

        let limit = max(0, min(40, 60 - (pending.count - existing.count)))
        let minutes = lead
        var next: [UNNotificationRequest] = []
        for (lesson, fire) in schedule.reminders(group: WidgetSchedule.group, lead: minutes, now: Date(), limit: limit) {
            let slot = lesson.date + "." + lesson.end

            let content = UNMutableNotificationContent()
            let unit = minutes == 3 ? "минуты" : "минут"
            content.title = "До конца пары \(minutes) \(unit)"
            content.body = "\(lesson.title) · до \(lesson.end)"
            content.sound = .default
            content.userInfo = ["scheduleDay": lesson.date]
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = WidgetSchedule.zone
            let components = calendar.dateComponents([.timeZone, .year, .month, .day, .hour, .minute], from: fire)
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            next.append(UNNotificationRequest(identifier: lessonEndNotificationPrefix + slot + ".\(minutes)", content: content, trigger: trigger))
        }

        let desired = Set(next.map(\.identifier))
        let old = Set(existing.map(\.identifier))
        center.removePendingNotificationRequests(withIdentifiers: Array(old.subtracting(desired)))
        for request in next {
            if needsPlan { return }
            if let saved = existing.first(where: { $0.identifier == request.identifier }),
               saved.content.body == request.content.body { continue }
            try? await center.add(request)
        }
    }
}

final class LessonEndNotificationHandler: NSObject, NotificationHandlerProtocol {
    weak var controller: WikiViewController?

    init(controller: WikiViewController) { self.controller = controller }

    func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        notification.request.identifier.hasPrefix(lessonEndNotificationPrefix) ? [.banner, .sound] : []
    }

    func didReceive(response: UNNotificationResponse) {
        let request = response.notification.request
        guard request.identifier.hasPrefix(lessonEndNotificationPrefix),
              let day = request.content.userInfo["scheduleDay"] as? String, WidgetSchedule.validDay(day),
              let url = URL(string: "siriuswiki://schedule?date=" + day) else { return }
        Task { @MainActor [weak self] in self?.controller?.openWidgetURL(url) }
    }
}
