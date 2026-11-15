import SwiftUI
import WidgetKit

struct ScheduleEntry: TimelineEntry {
    let date: Date
    let group: String
    let schedule: WidgetSchedule.Snapshot?

    var today: String { WidgetSchedule.day(date) }
    var allLessons: [WidgetSchedule.Lesson] { schedule?.groups[group] ?? [] }
    var todayLessons: [WidgetSchedule.Lesson] {
        allLessons.filter { $0.date == today }.sorted { $0.start < $1.start }
    }
    var next: WidgetSchedule.Lesson? {
        allLessons.filter { ($0.endsAt ?? .distantPast) > date }
            .min { ($0.startsAt ?? .distantFuture) < ($1.startsAt ?? .distantFuture) }
    }
    var activeLesson: WidgetSchedule.Lesson? {
        guard let next, let start = next.startsAt, start <= date else { return nil }
        return next
    }
    var emptyMessage: String {
        schedule?.covers(today, group: group) == true ? "На сегодня пар нет" : "Расписание недоступно"
    }
}

struct ScheduleProvider: TimelineProvider {
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
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = WidgetSchedule.zone
            let midnight = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))!
            let refresh = min(now.addingTimeInterval(60 * 60), midnight)
            let lessons = schedule?.groups[group] ?? []
            let changes = lessons.flatMap { [$0.startsAt, $0.endsAt].compactMap { $0 } }
                .filter { now < $0 && $0 < refresh }
            let entries = ([now] + Set(changes).sorted()).map {
                ScheduleEntry(date: $0, group: group, schedule: schedule)
            }
            completion(Timeline(entries: entries, policy: .after(refresh)))
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
                Text(next.start).font(.system(.title, design: .rounded).weight(.bold).monospacedDigit())
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
        if let starts = lesson.startsAt, starts <= entry.date { return "Сейчас" }
        return lesson.date == entry.today ? "Следующая пара" : WidgetSchedule.label(lesson.date)
    }

    private var agenda: some View {
        let limit = size == .systemLarge ? 5 : 3
        return VStack(alignment: .leading, spacing: size == .systemLarge ? 8 : 5) {
            HStack {
                Text(WidgetSchedule.label(entry.today)).font(.headline)
                Spacer(minLength: 8)
                Text(entry.group).font(.caption).foregroundStyle(.secondary).lineLimit(1)
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
                ForEach(entry.todayLessons.prefix(limit)) { lesson in row(lesson) }
                if entry.todayLessons.count > limit {
                    Text("Ещё \(entry.todayLessons.count - limit) · открыть расписание")
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
    let entry: ScheduleEntry

    var body: some View {
        Group {
            if #available(iOSApplicationExtension 16.0, *), family == .accessoryCircular {
                lockScreen
            } else if family == .systemMedium {
                HStack(spacing: 15) {
                    ring(size: 78, timerFont: 19)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("До конца пары").font(.headline)
                        Text(entry.activeLesson?.title ?? "Сейчас пары нет")
                            .font(.subheadline).lineLimit(2)
                        if let lesson = entry.activeLesson {
                            Text("До \(lesson.end)").font(.caption).foregroundStyle(.secondary)
                        } else if let next = entry.next {
                            Text("Дальше · \(next.start) · \(next.title)")
                                .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                        }
                    }
                    Spacer(minLength: 0)
                }
            } else {
                VStack(spacing: 5) {
                    Text("До конца пары").font(.caption.weight(.semibold)).foregroundStyle(accent)
                    ring(size: 67, timerFont: 16)
                    Text(entry.activeLesson?.title ?? "Сейчас пары нет")
                        .font(.caption2.weight(.medium)).lineLimit(2).multilineTextAlignment(.center)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetURL(WidgetLink.schedule(entry.today))
    }

    @available(iOSApplicationExtension 16.0, *)
    private var lockScreen: some View {
        ring(size: 54, timerFont: 11)
    }

    private func ring(size: CGFloat, timerFont: CGFloat) -> some View {
        ZStack {
            if let lesson = entry.activeLesson, let start = lesson.startsAt, let end = lesson.endsAt, end > start {
                if #available(iOSApplicationExtension 16.0, *) {
                    ProgressView(timerInterval: start...end, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                        .progressViewStyle(.circular)
                        .tint(accent)
                        .widgetAccent()
                        .accessibilityHidden(true)
                    Text(timerInterval: start...end, pauseTime: end, countsDown: true, showsHours: false)
                        .frame(width: size * 0.78)
                        .accessibilityHint("Осталось до конца пары")
                } else {
                    let remaining = max(0, min(1, end.timeIntervalSince(entry.date) / end.timeIntervalSince(start)))
                    Circle().strokeBorder(accent.opacity(0.20), lineWidth: 3)
                    Circle().trim(from: 0, to: remaining)
                        .stroke(accent, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .padding(2)
                    Text(end, style: .timer).frame(width: size * 0.78)
                }
            } else {
                Circle().strokeBorder(accent.opacity(0.24), lineWidth: 3)
                Image(systemName: "clock").foregroundStyle(accent).accessibilityLabel("Сейчас пары нет")
            }
        }
        .font(.system(size: timerFont, weight: .semibold, design: .rounded).monospacedDigit())
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .multilineTextAlignment(.center)
        .frame(width: size, height: size)
    }
}

private struct LessonCountdownWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SiriusLessonCountdown", provider: ScheduleProvider()) { entry in
            WidgetMaterial(content: LessonCountdownView(entry: entry))
        }
        .configurationDisplayName("До конца пары")
        .description("Круговой отсчёт показывает, сколько осталось до конца текущей пары.")
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
            if let finish = remaining.map(\.end).max() {
                Text("\(count)").font(.system(.largeTitle, design: .rounded).bold()).monospacedDigit()
                Text(count == 1 ? "пара" : (2...4).contains(count) ? "пары" : "пар")
                    .font(.subheadline.weight(.medium))
                Text("До \(finish)").font(.caption).foregroundStyle(.secondary)
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
