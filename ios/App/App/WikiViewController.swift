import Capacitor
import UIKit
import WebKit

@objc(WikiViewController)
final class WikiViewController: CAPBridgeViewController {
    private var pendingWidgetRoute: String?
    private var endNotificationHandler: LessonEndNotificationHandler?

    override func router() -> Router { WikiRouter() }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SiriusAccountPlugin())
        bridge?.registerPluginInstance(SiriusWikiContentPlugin())
        let handler = LessonEndNotificationHandler(controller: self)
        endNotificationHandler = handler
        bridge?.notificationRouter.localNotificationHandler = handler
    }

    @discardableResult
    func openWidgetURL(_ url: URL) -> Bool {
        guard let link = URLComponents(url: url, resolvingAgainstBaseURL: false),
              link.scheme == "siriuswiki", link.path.isEmpty, link.user == nil, link.port == nil else { return false }
        let route: String
        switch link.host {
        case "schedule":
            guard let day = link.queryItems?.first(where: { $0.name == "date" })?.value,
                  WidgetSchedule.validDay(day) else { return false }
            route = "#/schedule?date=" + day
        case "account": route = "#/study/account"
        case "review": route = "#/study/review"
        default: return false
        }
        pendingWidgetRoute = route
        bridge?.triggerWindowJSEvent(eventName: "sirius-widget-open")
        return true
    }

    func consumeWidgetRoute() -> String {
        defer { pendingWidgetRoute = nil }
        return pendingWidgetRoute ?? ""
    }
}

struct WikiRouter: Router {
    var basePath = ""

    func route(for path: String) -> String {
        if path.hasPrefix("/"), let installed = WikiLibrary.shared.file(for: String(path.dropFirst())) {
            return installed.path
        }
        var standard = CapacitorRouter()
        standard.basePath = basePath
        return standard.route(for: path)
    }
}

final class WikiNoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

enum WikiNetwork {
    static let site = URL(string: "https://arduradiokot.github.io/sirius-it-wiki/")!
    static let delegate = WikiNoRedirect()
    static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 35
        return URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
    }()

    static func data(_ request: URLRequest, limit: Int) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, data.count <= limit else { throw URLError(.badServerResponse) }
        return (data, http)
    }
}
