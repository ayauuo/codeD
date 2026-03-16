# S3 CORS 設定說明

為了讓下載頁 (https://guolicom.net/download) 能成功透過 `fetch(imageUrl)` 或 `<img src="...">` 讀取 S3 的 Pre-signed 圖片，S3 Bucket 必須設定 CORS。

## 設定步驟

1. 登入 [AWS S3 主控台](https://s3.console.aws.amazon.com/)
2. 選擇 Bucket：`my-photobooth-photos-2026`
3. 點選 **Permissions** 分頁
4. 捲動到 **Cross-origin resource sharing (CORS)** 區塊
5. 點選 **Edit**
6. 將 `s3_cors_config.json` 的內容貼上（或直接輸入以下 JSON）
7. 儲存

## CORS 設定範例

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "https://guolicom.net",
      "https://www.guolicom.net",
      "http://localhost:5173",
      "https://app"
    ],
    "ExposeHeaders": []
  }
]
```

- **AllowedOrigins**：允許哪些網域跨域讀取 S3 資源
  - `guolicom.net`：正式下載頁
  - `localhost:5173`：本地開發
  - `https://app`：WebView2 虛擬主機（拍貼機內嵌網頁）

## C# 端已實作

- `BoothBridge.UploadToS3Async` 已改為產生 **1 小時過期**的 Pre-signed URL
- Pre-signed URL 可讓私有 Bucket 的物件在時效內被讀取，無需將 Bucket 設為公開
