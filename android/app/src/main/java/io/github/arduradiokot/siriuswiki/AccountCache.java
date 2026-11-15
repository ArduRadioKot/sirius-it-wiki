package io.github.arduradiokot.siriuswiki;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class AccountCache {
    private static final String KEY = "sirius-wiki-account-v1";
    private static final int IV_LENGTH = 12;
    private final AtomicFile file;

    AccountCache(Context context) {
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), "account-v1.cache"));
    }

    private SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        SecretKey existing = (SecretKey) store.getKey(KEY, null);
        if (existing != null || !create) return existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build());
        return generator.generateKey();
    }

    String read() throws Exception {
        if (!file.getBaseFile().exists()) return null;
        byte[] bytes = file.readFully();
        SecretKey secret = key(false);
        if (bytes.length <= IV_LENGTH || secret == null) throw new IllegalStateException("Invalid cache");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, secret, new GCMParameterSpec(128, Arrays.copyOf(bytes, IV_LENGTH)));
        return new String(cipher.doFinal(bytes, IV_LENGTH, bytes.length - IV_LENGTH), StandardCharsets.UTF_8);
    }

    void write(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(true));
        byte[] bytes = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        FileOutputStream stream = file.startWrite();
        try {
            stream.write(cipher.getIV());
            stream.write(bytes);
            file.finishWrite(stream);
        } catch (Exception error) {
            file.failWrite(stream);
            throw error;
        }
    }

    void clear() { file.delete(); }
}
