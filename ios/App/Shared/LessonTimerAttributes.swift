import ActivityKit
import Foundation

@available(iOS 16.2, *)
struct LessonTimerAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let title: String
    }

    let key: String
    let day: String
    let start: Date
    let end: Date
}
