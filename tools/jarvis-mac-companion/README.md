# Jarvis Mac Companion

This optional Mac helper provides the Jared-style global hotkey. It does not
host Ellie or store an OpenAI key. It sends a spoken request to the deployed
Jarvis endpoint and speaks the returned answer with a macOS voice.

Build and start it from this folder:

```bash
swiftc JarvisCompanion.swift -framework Cocoa -framework Speech -framework AVFoundation -o JarvisCompanion
JARVIS_API_URL="https://your-render-backend.onrender.com/api" ./JarvisCompanion
```

Press **Option + Command + J** once to begin talking and again to stop. The
first run requires Microphone and Speech Recognition permission. macOS may also
ask for Input Monitoring permission so the global hotkey can work when another
app is focused. Enable it in System Settings → Privacy & Security.

Use `JARVIS_VOICE_IDENTIFIER` only if you want to force one installed macOS
voice. Otherwise the Mac system voice is used.
