import Capacitor
import CryptoKit
import Foundation

@objc(SiriusWikiContentPlugin)
final class SiriusWikiContentPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "SiriusWikiContentPlugin"
    let jsName = "SiriusWikiContent"
    let pluginMethods = [CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise)!]
    private var attempt: TimeInterval = -.infinity
    private var refreshing = false

    @objc func sync(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard !refreshing else { call.resolve(["updated": false]); return }
            let force = call.getBool("force", false)
            let lastCheck = UserDefaults.standard.double(forKey: "wiki-library-checked")
            let elapsed = Date().timeIntervalSince1970 - lastCheck
            let now = ProcessInfo.processInfo.systemUptime
            guard force || ((elapsed < 0 || elapsed >= 900) && now - attempt >= 60) else {
                call.resolve(["updated": false])
                return
            }
            refreshing = true
            attempt = now
            defer { refreshing = false }
            do {
                let updated = try await WikiLibrary.shared.sync()
                UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "wiki-library-checked")
                call.resolve(["updated": updated])
            } catch {
                call.reject("Не удалось обновить материалы.", "SYNC_FAILED")
            }
        }
    }
}

final class WikiLibrary {
    static let shared = WikiLibrary()
    private static let catalogURL = URL(string: "https://api.github.com/repos/ArduRadioKot/sirius-it-wiki/git/trees/main?recursive=1")!
    private static let index = "content-index.json"
    private let manager = FileManager.default
    private let lock = NSLock()
    private let root: URL

    private struct Snapshot: Codable {
        let revision: String
        let files: [String: String]
    }
    private struct Catalog: Decodable {
        struct Entry: Decodable {
            let path: String
            let sha: String
            let mode: String
            let type: String
            let size: Int?
        }
        let sha: String
        let truncated: Bool
        let tree: [Entry]
    }

    private var current: Snapshot
    private var blobs: URL { root.appendingPathComponent("blobs", isDirectory: true) }
    private var state: URL { root.appendingPathComponent("active.json") }

    private init() {
        root = URL.applicationSupportDirectoryCompatible.appendingPathComponent("WikiLibrary", isDirectory: true)
        let file = root.appendingPathComponent("active.json")
        current = (try? JSONDecoder().decode(Snapshot.self, from: Data(contentsOf: file))) ?? Snapshot(revision: "", files: [:])
    }

    private func snapshot() -> Snapshot {
        lock.lock()
        defer { lock.unlock() }
        return current
    }

    private func activate(_ snapshot: Snapshot) throws {
        try JSONEncoder().encode(snapshot).write(to: state, options: .atomic)
        lock.lock()
        current = snapshot
        lock.unlock()
    }

    func file(for path: String) -> URL? {
        guard Self.isMaterial(path), let sha = snapshot().files[path], Self.validSHA(sha) else { return nil }
        let url = blobs.appendingPathComponent(sha)
        return manager.fileExists(atPath: url.path) ? url : nil
    }

    private static func validSHA(_ value: String) -> Bool {
        value.range(of: "^[0-9a-f]{40}$", options: .regularExpression) != nil
    }

    private static func isMaterial(_ path: String) -> Bool {
        guard !path.contains("%"), !path.contains("\\"),
              path.components(separatedBy: "/").allSatisfy({ !$0.isEmpty && !$0.hasPrefix(".") }) else { return false }
        if path == index { return true }
        let suffix = (path as NSString).pathExtension
        if suffix == "md" && ["articles/", "life/", "courses/linear/"].contains(where: path.hasPrefix) { return true }
        if suffix == "json" {
            return path.range(of: "^courses/matan/materials/(chapters|originals)/[^/]+\\.json$", options: .regularExpression) != nil
        }
        return ["assets/", "articles/files/", "life/", "courses/"].contains(where: path.hasPrefix)
            && ["svg", "jpg", "jpeg", "png", "webp", "gif", "pdf", "docx"].contains(suffix)
    }

    func sync() async throws -> Bool {
        var request = URLRequest(url: Self.catalogURL)
        request.setValue("Sirius-Wiki-iOS", forHTTPHeaderField: "User-Agent")
        let (data, response) = try await WikiNetwork.data(request, limit: 4 * 1024 * 1024)
        guard response.statusCode == 200 else { throw URLError(.badServerResponse) }
        let catalog = try JSONDecoder().decode(Catalog.self, from: data)
        guard !catalog.truncated, Self.validSHA(catalog.sha) else { throw URLError(.cannotParseResponse) }
        let installed = snapshot()
        if installed.revision == catalog.sha { return false }

        let assets = Bundle.main.bundleURL.appendingPathComponent("public")
        let manifest = assets.appendingPathComponent("bundled-content.json")
        let bundled = try JSONDecoder().decode([String: String].self, from: Data(contentsOf: manifest))
        var library: [String: String] = [:]
        var sizes: [String: Int] = [:]
        var total = 0
        for entry in catalog.tree where entry.type == "blob" && entry.mode == "100644" && Self.isMaterial(entry.path) {
            guard let size = entry.size, (0...64 * 1024 * 1024).contains(size), Self.validSHA(entry.sha) else {
                throw URLError(.cannotParseResponse)
            }
            total += size
            guard total <= 200 * 1024 * 1024 else { throw URLError(.dataLengthExceedsMaximum) }
            library[entry.path] = entry.sha
            sizes[entry.path] = size
        }
        guard library[Self.index] != nil else { throw URLError(.cannotParseResponse) }

        try manager.createDirectory(at: blobs, withIntermediateDirectories: true)
        var backupRoot = root
        var settings = URLResourceValues()
        settings.isExcludedFromBackup = true
        try backupRoot.setResourceValues(settings)
        let files = library.filter { bundled[$0.key] != $0.value }
        let retained = Set(files.values).union(installed.files.values)
        for url in try manager.contentsOfDirectory(at: blobs, includingPropertiesForKeys: nil) {
            if !retained.contains(url.lastPathComponent) { try? manager.removeItem(at: url) }
        }

        for (path, sha) in files {
            guard let size = sizes[path] else { throw URLError(.cannotParseResponse) }
            let destination = blobs.appendingPathComponent(sha)
            let existing = try? destination.resourceValues(forKeys: [.fileSizeKey]).fileSize
            if existing != size { try await download(path: path, sha: sha, size: size, to: destination) }
        }

        let index = files[Self.index].map { blobs.appendingPathComponent($0) } ?? assets.appendingPathComponent(Self.index)
        try validateIndex(index, library: library)
        try activate(Snapshot(revision: catalog.sha, files: files))
        return true
    }

    private func validateIndex(_ url: URL, library: [String: String]) throws {
        guard let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] else {
            throw URLError(.cannotParseResponse)
        }
        for key in ["life", "articles"] {
            guard let entries = object[key] as? [[String: Any]], entries.allSatisfy({ entry in
                guard let path = entry["path"] as? String, let slug = entry["slug"] as? String,
                      let title = entry["title"] as? String else { return false }
                return path.hasPrefix(key + "/") && path.hasSuffix(".md") && library[path] != nil
                    && !slug.isEmpty && !title.isEmpty
            }) else { throw URLError(.cannotParseResponse) }
        }
    }

    private func download(path: String, sha: String, size: Int, to destination: URL) async throws {
        let url = WikiNetwork.site.appendingPathComponent(path)
        let (temporary, response) = try await WikiNetwork.session.download(for: URLRequest(url: url))
        defer { try? manager.removeItem(at: temporary) }
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              try temporary.resourceValues(forKeys: [.fileSizeKey]).fileSize == size else {
            throw URLError(.badServerResponse)
        }
        let bytes = try Data(contentsOf: temporary, options: .mappedIfSafe)
        var hash = Insecure.SHA1()
        hash.update(data: Data("blob \(size)\0".utf8))
        hash.update(data: bytes)
        let actual = hash.finalize().map { String(format: "%02x", $0) }.joined()
        guard actual == sha else { throw URLError(.cannotDecodeContentData) }
        try bytes.write(to: destination, options: .atomic)
    }
}

private extension URL {
    static var applicationSupportDirectoryCompatible: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    }
}
