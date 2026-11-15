import ActivityKit
import Foundation
import UIKit

@MainActor
@available(iOS 16.2, *)
final class LessonLiveTimer {
    static let shared = LessonLiveTimer()
    private static let maximumSlots = 5
    private let defaults = UserDefaults.standard
    private let enabledKey = "lesson-live-timer-enabled"
    private var boundaryTask: Task<Void, Never>?
    private var reconciling = false
    private var needsReconcile = false

    var enabled: Bool { defaults.bool(forKey: enabledKey) }
    var allowed: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    func configure(enabled: Bool) async -> Bool {
        guard !enabled || allowed else { return false }
        defaults.set(enabled, forKey: enabledKey)
        await reconcile()
        return true
    }

    func reconcile() async {
        needsReconcile = true
        guard !reconciling else { return }
        reconciling = true
        defer { reconciling = false }
        while needsReconcile {
            needsReconcile = false
            await updateActivities()
        }
    }

    private func updateActivities() async {
        boundaryTask?.cancel()
        boundaryTask = nil
        let active = Activity<LessonTimerAttributes>.activities
        guard enabled, allowed else {
            for activity in active { await activity.end(nil, dismissalPolicy: .immediate) }
            return
        }

        let now = Date()
        let horizon = now.addingTimeInterval(24 * 60 * 60)
        let slots = WidgetSchedule.current()?.timerSlots(group: WidgetSchedule.group, now: now, horizon: horizon) ?? []
        let wanted: [WidgetSchedule.TimerSlot]
        if #available(iOS 26.0, *) { wanted = Array(slots.prefix(Self.maximumSlots)) }
        else { wanted = Array(slots.prefix { $0.start <= now }) }
        let validKeys = Set(wanted.map(\.key))
        var existing = Set<String>()

        for activity in active {
            guard validKeys.contains(activity.attributes.key), activity.attributes.end > now,
                  existing.insert(activity.attributes.key).inserted else {
                await activity.end(nil, dismissalPolicy: .immediate)
                continue
            }
            if let slot = wanted.first(where: { $0.key == activity.attributes.key }),
               activity.content.state.title != slot.title {
                await activity.update(content(for: slot))
            }
        }

        if UIApplication.shared.applicationState == .active {
            for slot in wanted where !existing.contains(slot.key) {
                if needsReconcile { return }
                do { try request(slot) }
                catch { break } // ActivityKit may reject requests after reaching its system limit.
            }
        }

        // A foreground app can retire the card exactly at the end of a pair.
        // When suspended, the system uses the card's stale date and the bounded countdown.
        let nextBoundary = slots.flatMap { [$0.start, $0.end] }.filter { $0 > now }.min()
        if let nextBoundary {
            let seconds = max(1, nextBoundary.timeIntervalSinceNow)
            boundaryTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                guard !Task.isCancelled else { return }
                await self?.reconcile()
            }
        }
    }

    private func content(for slot: WidgetSchedule.TimerSlot) -> ActivityContent<LessonTimerAttributes.ContentState> {
        ActivityContent(state: .init(title: slot.title), staleDate: slot.end, relevanceScore: 1)
    }

    private func request(_ slot: WidgetSchedule.TimerSlot) throws {
        let attributes = LessonTimerAttributes(key: slot.key, day: slot.day, start: slot.start, end: slot.end)
        if slot.start <= Date() {
            _ = try Activity.request(attributes: attributes, content: content(for: slot), pushType: nil)
        } else if #available(iOS 26.0, *) {
            let alert = AlertConfiguration(title: "Пара началась", body: "Таймер покажет, сколько осталось до её конца.", sound: .default)
            _ = try Activity.request(attributes: attributes, content: content(for: slot), pushType: nil,
                                     style: .standard, alertConfiguration: alert, start: slot.start)
        }
    }
}
