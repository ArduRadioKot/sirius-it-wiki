import Capacitor
import UIKit
import WebKit
import WidgetKit

@objc(SiriusAccountPlugin)
final class SiriusAccountPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "SiriusAccountPlugin"
    let jsName = "SiriusAccount"
    let pluginMethods = [
        "signIn", "refresh", "schedule", "cachedSchedule", "cacheSchedule", "loadCache", "saveCache", "clear", "setScheduleGroup", "widgetRoute",
        "getEndReminderSettings", "setEndReminderSettings", "getLiveTimerSettings", "setLiveTimerSettings"
    ]
        .compactMap { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }

    static let host = "lks.siriusuniversity.ru"
    static let origin = URL(string: "https://lks.siriusuniversity.ru/")!
    private var signInPage: AccountSignIn?
    private var generation = 0

    private static func cookies() -> WKHTTPCookieStore { WKWebsiteDataStore.default().httpCookieStore }

    static func official(_ url: URL) -> Bool {
        url.scheme == "https" && url.host == host && (url.port == nil || url.port == 443)
            && url.user == nil && url.password == nil
    }

    private func cacheFile() throws -> URL {
        var directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                    appropriateFor: nil, create: true)
            .appendingPathComponent("SiriusAccount", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var settings = URLResourceValues()
        settings.isExcludedFromBackup = true
        try directory.setResourceValues(settings)
        return directory.appendingPathComponent("account.json")
    }

    @objc func signIn(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let presenter = bridge?.viewController, signInPage == nil else {
                call.reject("Окно входа уже открыто.", "BUSY")
                return
            }
            let page = AccountSignIn { [weak self] signedIn in
                guard let self else { call.reject("Вход отменён.", "CANCELLED"); return }
                self.signInPage = nil
                if signedIn { self.refresh(call) } else { call.reject("Вход отменён.", "CANCELLED") }
            }
            signInPage = page
            let navigation = UINavigationController(rootViewController: page)
            navigation.modalPresentationStyle = .fullScreen
            presenter.present(navigation, animated: true)
        }
    }

    private enum AccountError: Error { case loginRequired }

    @MainActor private func readPage(_ path: String, generation started: Int) async throws -> String {
        let url = Self.origin.appendingPathComponent(path)
        let store = Self.cookies()
        let cookies = await store.allCookies().filter { cookie in
            let domain = cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))
            let eligibleHost = Self.host == domain || (cookie.domain.hasPrefix(".") && Self.host.hasSuffix("." + domain))
            let eligiblePath = cookie.path == "/" || url.path == cookie.path
                || url.path.hasPrefix(cookie.path.hasSuffix("/") ? cookie.path : cookie.path + "/")
            return eligibleHost && eligiblePath && (cookie.expiresDate.map { $0 > Date() } ?? true)
        }
        guard started == generation, !cookies.isEmpty else { throw AccountError.loginRequired }
        var request = URLRequest(url: url)
        for (key, value) in HTTPCookie.requestHeaderFields(with: cookies) { request.setValue(value, forHTTPHeaderField: key) }
        let (data, response) = try await WikiNetwork.data(request, limit: 8 * 1024 * 1024)
        guard started == generation else { throw AccountError.loginRequired }
        if [401, 403].contains(response.statusCode) || (300..<400).contains(response.statusCode) {
            throw AccountError.loginRequired
        }
        guard response.statusCode == 200, let html = String(data: data, encoding: .utf8) else {
            throw URLError(.badServerResponse)
        }
        let fields = response.allHeaderFields.reduce(into: [String: String]()) { result, entry in
            if let field = entry.key as? String, let value = entry.value as? String { result[field] = value }
        }
        for cookie in HTTPCookie.cookies(withResponseHeaderFields: fields, for: url) {
            guard started == generation else { throw AccountError.loginRequired }
            await store.setCookie(cookie)
        }
        return html
    }

    @objc func refresh(_ call: CAPPluginCall) {
        Task { @MainActor in
            let started = generation
            do {
                var pages = ["journal": try await readPage("journal/list", generation: started)]
                pages["trajectory"] = try? await readPage("student/trajectory", generation: started)
                pages["dashboard"] = try? await readPage("dashboard", generation: started)
                guard started == generation else { throw AccountError.loginRequired }
                call.resolve(["pages": pages])
            } catch AccountError.loginRequired {
                call.reject("Войдите в ЛК Сириуса, чтобы обновить данные.", "LOGIN_REQUIRED")
            } catch {
                call.reject("Не удалось загрузить данные ЛК Сириуса.", "NETWORK")
            }
        }
    }

    @objc func schedule(_ call: CAPPluginCall) {
        Task {
            do {
                let request = URLRequest(url: WikiNetwork.site.appendingPathComponent("data/schedule.json"))
                let (bytes, response) = try await WikiNetwork.data(request, limit: 2 * 1024 * 1024)
                guard response.statusCode == 200,
                      let data = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else {
                    throw URLError(.badServerResponse)
                }
                if WidgetSchedule.save(bytes) {
                    WidgetCenter.shared.reloadAllTimelines()
                    if #available(iOS 16.2, *) { await LessonLiveTimer.shared.reconcile() }
                    await LessonEndReminders.shared.replan()
                }
                call.resolve(data)
            } catch { call.reject("Не удалось обновить расписание.", "NETWORK") }
        }
    }

    @objc func setScheduleGroup(_ call: CAPPluginCall) {
        if let group = call.getString("group"), WidgetSchedule.select(group) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
        Task {
            if #available(iOS 16.2, *) { await LessonLiveTimer.shared.reconcile() }
            await LessonEndReminders.shared.replan()
        }
    }

    @objc func cachedSchedule(_ call: CAPPluginCall) {
        guard let bytes = WidgetSchedule.currentData(),
              let data = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any] else {
            call.reject("Расписание недоступно.", "CACHE")
            return
        }
        call.resolve(data)
    }

    @objc func cacheSchedule(_ call: CAPPluginCall) {
        guard let value = call.getString("value") else {
            call.reject("Некорректное расписание.", "CACHE")
            return
        }
        Task {
            if WidgetSchedule.save(Data(value.utf8)) {
                WidgetCenter.shared.reloadAllTimelines()
                if #available(iOS 16.2, *) { await LessonLiveTimer.shared.reconcile() }
                await LessonEndReminders.shared.replan()
            }
            call.resolve()
        }
    }

    @objc func getEndReminderSettings(_ call: CAPPluginCall) {
        Task { @MainActor in
            let reminders = LessonEndReminders.shared
            call.resolve(["enabled": await reminders.isEnabled(), "lead": reminders.lead])
        }
    }

    @objc func setEndReminderSettings(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled", false)
        let lead = call.getInt("lead") ?? 5
        Task { @MainActor in
            do {
                let reminders = LessonEndReminders.shared
                guard try await reminders.configure(enabled: enabled, lead: lead) else {
                    call.reject("Разрешите уведомления для Сириус Wiki в настройках iPhone.", "PERMISSION")
                    return
                }
                call.resolve(["enabled": reminders.enabled, "lead": reminders.lead])
            } catch {
                call.reject("Не удалось настроить уведомления.", "REMINDERS")
            }
        }
    }

    @objc func widgetRoute(_ call: CAPPluginCall) {
        Task { @MainActor in
            let controller = bridge?.viewController as? WikiViewController
            call.resolve(["route": controller?.consumeWidgetRoute() ?? ""])
        }
    }

    @objc func getLiveTimerSettings(_ call: CAPPluginCall) {
        Task { @MainActor in
            if #available(iOS 16.2, *) {
                call.resolve(["available": true, "enabled": LessonLiveTimer.shared.enabled])
            } else {
                call.resolve(["available": false, "enabled": false])
            }
        }
    }

    @objc func setLiveTimerSettings(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled", false)
        Task { @MainActor in
            guard #available(iOS 16.2, *) else {
                call.reject("Таймер требует iOS 16.2 или новее.", "UNAVAILABLE")
                return
            }
            guard await LessonLiveTimer.shared.configure(enabled: enabled) else {
                call.reject("Разрешите «Активности» для Сириус Wiki в настройках iPhone.", "PERMISSION")
                return
            }
            call.resolve(["available": true, "enabled": LessonLiveTimer.shared.enabled])
        }
    }

    @objc func loadCache(_ call: CAPPluginCall) {
        do {
            let file = try cacheFile()
            if !FileManager.default.fileExists(atPath: file.path) { call.resolve(); return }
            call.resolve(["value": try String(contentsOf: file, encoding: .utf8)])
        } catch { call.reject("Не удалось прочитать сохранённые данные.", "CACHE") }
    }

    @objc func saveCache(_ call: CAPPluginCall) {
        do {
            let file = try cacheFile()
            let data = Data((call.getString("value") ?? "").utf8)
            guard data.count <= 8 * 1024 * 1024 else { throw CocoaError(.fileWriteOutOfSpace) }
            if !data.isEmpty { try data.write(to: file, options: [.atomic, .completeFileProtectionUnlessOpen]) }
            else if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
            call.resolve()
        } catch { call.reject("Не удалось сохранить данные.", "CACHE") }
    }

    @objc func clear(_ call: CAPPluginCall) {
        Task { @MainActor in
            generation += 1
            do {
                let file = try cacheFile()
                if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
                let store = Self.cookies()
                for cookie in await store.allCookies() {
                    let domain = cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))
                    if Self.host == domain || (cookie.domain.hasPrefix(".") && Self.host.hasSuffix("." + domain)) {
                        await store.deleteCookie(cookie)
                    }
                }
                call.resolve()
            } catch { call.reject("Не удалось удалить данные ЛК.", "CACHE") }
        }
    }
}

private final class AccountSignIn: UIViewController, WKNavigationDelegate {
    private static let captchaHosts: Set<String> = ["smartcaptcha.yandexcloud.net", "captcha-api.yandex.ru"]
    private let page = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    private var completion: ((Bool) -> Void)?

    init(completion: @escaping (Bool) -> Void) {
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { nil }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = SiriusAccountPlugin.host
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Закрыть", style: .plain, target: self, action: #selector(close))
        view = page
        page.navigationDelegate = self
        page.load(URLRequest(url: SiriusAccountPlugin.origin.appendingPathComponent("dashboard")))
    }

    @objc private func close() { finish(false) }

    private func finish(_ signedIn: Bool) {
        guard let finished = completion else { return }
        completion = nil
        page.stopLoading()
        dismiss(animated: true) { finished(signedIn) }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let frame = navigationAction.targetFrame else {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(Self.allows(url, mainFrame: frame.isMainFrame) ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard let url = navigationResponse.response.url else { decisionHandler(.cancel); return }
        decisionHandler(Self.allows(url, mainFrame: navigationResponse.isForMainFrame) ? .allow : .cancel)
    }

    private static func allows(_ url: URL, mainFrame: Bool) -> Bool {
        if SiriusAccountPlugin.official(url) { return true }
        guard !mainFrame else { return false }
        if url.absoluteString == "about:blank" || url.absoluteString == "about:srcdoc" { return true }
        return url.scheme == "https" && (url.port == nil || url.port == 443)
            && url.user == nil && url.password == nil && captchaHosts.contains(url.host ?? "")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let url = webView.url, SiriusAccountPlugin.official(url) else { return }
        if url.path == "/dashboard" || url.path.hasPrefix("/dashboard/") || url.path == "/journal/list"
            || url.path == "/student/trajectory" { finish(true) }
    }
}
