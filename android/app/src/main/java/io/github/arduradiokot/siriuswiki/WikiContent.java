package io.github.arduradiokot.siriuswiki;

import android.content.Context;
import android.net.Uri;
import android.util.AtomicFile;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

final class WikiContent {
    private static final String CATALOG =
        "https://api.github.com/repos/ArduRadioKot/sirius-it-wiki/git/trees/main?recursive=1";
    private static final String SITE = "https://arduradiokot.github.io/sirius-it-wiki/";
    private static final String INDEX = "content-index.json";
    private static final int MAX_FILE_SIZE = 64 * 1024 * 1024;
    private static final long MAX_LIBRARY_SIZE = 200L * 1024 * 1024;
    private static final int MAX_CATALOG_SIZE = 4 * 1024 * 1024;
    private static WikiContent instance;

    private final Context context;
    private final File blobs;
    private final AtomicFile stateFile;
    private volatile JSONObject current;

    static synchronized WikiContent get(Context context) {
        if (instance == null) instance = new WikiContent(context);
        return instance;
    }

    private WikiContent(Context context) {
        this.context = context.getApplicationContext();
        File library = new File(context.getNoBackupFilesDir(), "wiki-library");
        blobs = new File(library, "blobs");
        stateFile = new AtomicFile(new File(library, "active.json"));
        try {
            current = new JSONObject(new String(stateFile.readFully(), StandardCharsets.UTF_8));
        } catch (Exception error) {
            current = new JSONObject();
        }
    }

    private static String contentType(String path) {
        if (path == null || path.startsWith("/") || path.contains("\\") || path.contains("%")) return null;
        for (String part : path.split("/", -1)) {
            if (part.isEmpty() || part.startsWith(".")) return null;
        }
        if (INDEX.equals(path)) return "application/json";
        if ((path.startsWith("articles/") || path.startsWith("life/") || path.startsWith("courses/linear/"))
            && path.endsWith(".md")) return "text/plain";
        if (path.matches("courses/matan/materials/(chapters|originals)/[^/]+\\.json")) return "application/json";
        if (!path.startsWith("assets/") && !path.startsWith("articles/files/")
            && !path.startsWith("life/") && !path.startsWith("courses/")) return null;
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".webp")) return "image/webp";
        if (path.endsWith(".gif")) return "image/gif";
        if (path.endsWith(".pdf")) return "application/pdf";
        if (path.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        return null;
    }

    synchronized WebResourceResponse open(String path) {
        String type = contentType(path);
        JSONObject files = current.optJSONObject("files");
        if (type == null || files == null) return null;
        String sha = files.optString(path);
        if (!validSha(sha)) return null;
        try {
            File file = new File(blobs, sha);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            headers.put("Content-Length", Long.toString(file.length()));
            headers.put("Content-Security-Policy", "default-src 'none'; sandbox");
            headers.put("X-Content-Type-Options", "nosniff");
            String charset = type.equals("text/plain") || type.equals("application/json") ? "UTF-8" : null;
            return new WebResourceResponse(type, charset, 200, "OK", headers, new FileInputStream(file));
        } catch (IOException error) {
            return null;
        }
    }

    long lastChecked() {
        return context.getSharedPreferences("wiki-library", Context.MODE_PRIVATE).getLong("checked", 0);
    }

    boolean sync() throws Exception {
        JSONObject tree = new JSONObject(readText(CATALOG, MAX_CATALOG_SIZE));
        String revision = tree.getString("sha");
        if (!validSha(revision) || tree.optBoolean("truncated", true)) throw new IOException("Invalid catalog");
        if (revision.equals(current.optString("revision"))) {
            markChecked();
            return false;
        }

        JSONObject bundled;
        try (InputStream input = context.getAssets().open("public/bundled-content.json")) {
            bundled = new JSONObject(readText(input, MAX_CATALOG_SIZE));
        }
        JSONArray entries = tree.getJSONArray("tree");
        Map<String, String> library = new LinkedHashMap<>();
        Map<String, Integer> sizes = new LinkedHashMap<>();
        long total = 0;
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.getJSONObject(i);
            String path = entry.getString("path");
            if (contentType(path) == null || !"blob".equals(entry.optString("type"))
                || !"100644".equals(entry.optString("mode"))) continue;
            String sha = entry.getString("sha");
            int size = entry.getInt("size");
            total += size;
            if (!validSha(sha) || size < 0 || size > MAX_FILE_SIZE || total > MAX_LIBRARY_SIZE) {
                throw new IOException("Invalid catalog entry");
            }
            library.put(path, sha);
            sizes.put(path, size);
        }
        if (!library.containsKey(INDEX)) throw new IOException("Missing index");

        if (!blobs.mkdirs() && !blobs.isDirectory()) throw new IOException("Cannot create library");
        JSONObject files = new JSONObject();
        for (Map.Entry<String, String> entry : library.entrySet()) {
            if (!entry.getValue().equals(bundled.optString(entry.getKey()))) files.put(entry.getKey(), entry.getValue());
        }
        Set<String> wanted = hashes(files);
        Set<String> retained = new HashSet<>(wanted);
        retained.addAll(hashes(current.optJSONObject("files")));
        prune(retained);

        var paths = files.keys();
        while (paths.hasNext()) {
            String path = paths.next();
            String sha = files.getString(path);
            File file = new File(blobs, sha);
            int size = sizes.get(path);
            if (!file.isFile() || file.length() != size) download(path, sha, size, file);
        }

        String indexHash = files.optString(INDEX);
        try (InputStream input = indexHash.isEmpty() ? context.getAssets().open("public/" + INDEX)
            : new FileInputStream(new File(blobs, indexHash))) {
            JSONObject index = new JSONObject(readText(input, MAX_CATALOG_SIZE));
            validateIndex(index.getJSONArray("life"), library, "life/");
            validateIndex(index.getJSONArray("articles"), library, "articles/");
        }

        JSONObject next = new JSONObject().put("revision", revision).put("files", files);
        synchronized (this) {
            FileOutputStream output = stateFile.startWrite();
            try {
                output.write(next.toString().getBytes(StandardCharsets.UTF_8));
                stateFile.finishWrite(output);
            } catch (IOException error) {
                stateFile.failWrite(output);
                throw error;
            }
            current = next;
            prune(wanted);
        }
        markChecked();
        return true;
    }

    private void markChecked() {
        context.getSharedPreferences("wiki-library", Context.MODE_PRIVATE).edit()
            .putLong("checked", System.currentTimeMillis()).apply();
    }

    private static void validateIndex(JSONArray list, Map<String, String> library, String directory) throws Exception {
        for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.getJSONObject(i);
            String path = item.getString("path");
            if (!path.startsWith(directory) || !path.endsWith(".md") || !library.containsKey(path)
                || item.getString("slug").isEmpty() || item.getString("title").isEmpty()) {
                throw new IOException("Invalid article index");
            }
        }
    }

    private static Set<String> hashes(JSONObject files) {
        if (files == null) return Collections.emptySet();
        Set<String> result = new HashSet<>();
        files.keys().forEachRemaining(path -> result.add(files.optString(path)));
        return result;
    }

    private void prune(Set<String> retained) {
        File[] files = blobs.listFiles();
        if (files == null) return;
        for (File file : files) if (!retained.contains(file.getName())) file.delete();
    }

    private static boolean validSha(String sha) {
        return sha.matches("[0-9a-f]{40}");
    }

    private static HttpURLConnection connect(String address) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(15000);
        connection.setRequestProperty("User-Agent", "Sirius-Wiki-Android");
        connection.setRequestProperty("Cache-Control", "no-cache");
        if (connection.getResponseCode() == 200) return connection;
        connection.disconnect();
        throw new IOException("Wiki server unavailable");
    }

    private static String readText(String address, int limit) throws IOException {
        HttpURLConnection connection = connect(address);
        try (InputStream input = connection.getInputStream()) {
            return readText(input, limit);
        } finally {
            connection.disconnect();
        }
    }

    private static String readText(InputStream input, int limit) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        for (int count; (count = input.read(buffer)) != -1;) {
            if (output.size() + count > limit) throw new IOException("File too large");
            output.write(buffer, 0, count);
        }
        return output.toString(StandardCharsets.UTF_8.name());
    }

    private static void download(String path, String sha, int size, File destination) throws Exception {
        String address = Uri.parse(SITE).buildUpon().appendEncodedPath(Uri.encode(path, "/")).build().toString();
        File pending = new File(destination.getPath() + ".part");
        MessageDigest digest = MessageDigest.getInstance("SHA-1");
        digest.update(("blob " + size + "\0").getBytes(StandardCharsets.UTF_8));
        HttpURLConnection connection = connect(address);
        try {
            int total = 0;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(pending)) {
                byte[] buffer = new byte[32768];
                for (int count; (count = input.read(buffer)) != -1;) {
                    total += count;
                    if (total > size) throw new IOException("Unexpected file size");
                    output.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                }
                output.getFD().sync();
            }
            StringBuilder hash = new StringBuilder();
            for (byte value : digest.digest()) {
                hash.append(Character.forDigit((value >> 4) & 15, 16)).append(Character.forDigit(value & 15, 16));
            }
            if (total != size || !sha.contentEquals(hash) || !pending.renameTo(destination)) {
                throw new IOException("Wiki publication changed during download");
            }
        } finally {
            connection.disconnect();
            pending.delete();
        }
    }
}
