use webkit2gtk::{WebViewExt, SettingsExt, HardwareAccelerationPolicy};

#[tauri::command]
fn encrypt_string(plaintext: String) -> Result<String, String> {
    // XOR-based encryption with a derived key — not production crypto,
    // but ensures the API key is not stored as plaintext at rest.
    let key: &[u8] = b"anchor-ade-local-encryption-key!";
    let encrypted: Vec<u8> = plaintext
        .as_bytes()
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    Ok(base64_encode(&encrypted))
}

#[tauri::command]
fn decrypt_string(ciphertext: String) -> Result<String, String> {
    let key: &[u8] = b"anchor-ade-local-encryption-key!";
    let decoded = base64_decode(&ciphertext).map_err(|e| e.to_string())?;
    let decrypted: Vec<u8> = decoded
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    String::from_utf8(decrypted).map_err(|e| e.to_string())
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

fn base64_decode(data: &str) -> Result<Vec<u8>, String> {
    const DECODE: [u8; 128] = {
        let mut table = [255u8; 128];
        let chars = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut i = 0;
        while i < 64 {
            table[chars[i] as usize] = i as u8;
            i += 1;
        }
        table
    };
    let bytes: Vec<u8> = data.bytes().filter(|&b| b != b'=').collect();
    let mut result = Vec::new();
    for chunk in bytes.chunks(4) {
        let len = chunk.len();
        if len < 2 {
            break;
        }
        let b0 = *DECODE.get(chunk[0] as usize).ok_or("invalid base64")? as u32;
        let b1 = *DECODE.get(chunk[1] as usize).ok_or("invalid base64")? as u32;
        let b2 = if len > 2 {
            *DECODE.get(chunk[2] as usize).ok_or("invalid base64")? as u32
        } else {
            0
        };
        let b3 = if len > 3 {
            *DECODE.get(chunk[3] as usize).ok_or("invalid base64")? as u32
        } else {
            0
        };
        let triple = (b0 << 18) | (b1 << 12) | (b2 << 6) | b3;
        result.push(((triple >> 16) & 0xFF) as u8);
        if len > 2 {
            result.push(((triple >> 8) & 0xFF) as u8);
        }
        if len > 3 {
            result.push((triple & 0xFF) as u8);
        }
    }
    Ok(result)
}

#[tauri::command]
async fn fetch_page_html(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    resp.text().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn send_ntfy(topic: String, message: String) -> Result<(), String> {
    let url = format!("https://ntfy.sh/{}", topic);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&url)
        .header("Content-Type", "text/plain")
        .body(message)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("ntfy returned status {}", resp.status()))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK 2.44+ uses a DMA-BUF renderer that requires GPU access.
    // Disable it so the compositor falls back to shared-memory buffers.
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![encrypt_string, decrypt_string, fetch_page_html, send_ntfy])
        .setup(|app| {
            let win = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("Anchor")
            .inner_size(1200.0, 800.0)
            .min_inner_size(800.0, 600.0)
            .resizable(true)
            .center()
            .build()?;

            // Disable hardware-accelerated compositing inside WebKit so it
            // doesn't require EGL/GPU. This lets the window render even when
            // /dev/dri/renderD128 is inaccessible (e.g. WSL2 without the
            // render group).
            win.with_webview(|webview| {
                let wk: webkit2gtk::WebView = webview.inner();
                if let Some(settings) = WebViewExt::settings(&wk) {
                    SettingsExt::set_hardware_acceleration_policy(
                        &settings,
                        HardwareAccelerationPolicy::Never,
                    );
                }
            })?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
