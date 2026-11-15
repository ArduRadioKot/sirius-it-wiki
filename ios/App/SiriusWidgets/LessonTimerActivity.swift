import ActivityKit
import SwiftUI
import WidgetKit

@available(iOSApplicationExtension 16.2, *)
struct LessonTimerActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LessonTimerAttributes.self) { context in
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label(context.isStale ? "Пара закончилась" : "До конца пары", systemImage: "clock")
                    Spacer(minLength: 8)
                    countdown(context).font(.title2.weight(.semibold)).monospacedDigit()
                        .frame(maxWidth: 105, alignment: .trailing)
                }
                Text(context.state.title).font(.subheadline.weight(.medium)).lineLimit(2)
                if !context.isStale {
                    ProgressView(timerInterval: context.attributes.start...context.attributes.end, countsDown: true) {
                        EmptyView()
                    } currentValueLabel: {
                        EmptyView()
                    }
                    .accessibilityHidden(true)
                }
            }
            .padding(16)
            .activitySystemActionForegroundColor(.primary)
            .widgetURL(scheduleURL(context))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("До конца пары", systemImage: "clock").font(.caption)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    countdown(context).font(.headline.monospacedDigit()).frame(width: 72, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.isStale ? "Пара закончилась" : context.state.title).lineLimit(2)
                }
            } compactLeading: {
                Image(systemName: "clock").accessibilityLabel("До конца пары")
            } compactTrailing: {
                countdown(context).monospacedDigit().frame(width: 47, alignment: .trailing)
            } minimal: {
                Image(systemName: "clock").accessibilityLabel("До конца пары")
            }
            .widgetURL(scheduleURL(context))
        }
    }

    @ViewBuilder
    private func countdown(_ context: ActivityViewContext<LessonTimerAttributes>) -> some View {
        if context.isStale {
            Text("0:00")
        } else {
            Text(timerInterval: context.attributes.start...context.attributes.end,
                 pauseTime: context.attributes.end, countsDown: true, showsHours: true)
        }
    }

    private func scheduleURL(_ context: ActivityViewContext<LessonTimerAttributes>) -> URL? {
        URL(string: "siriuswiki://schedule?date=" + context.attributes.day)
    }
}
