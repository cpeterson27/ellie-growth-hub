import Cocoa
import AVFoundation
import Speech

struct JarvisResponse: Decodable {
    struct Data: Decodable { let answer: String? }
    let success: Bool
    let data: Data?
}

final class JarvisCompanion: NSObject, NSApplicationDelegate, SFSpeechRecognizerDelegate {
    private let endpoint = ProcessInfo.processInfo.environment["JARVIS_API_URL"] ?? ""
    private let voiceIdentifier = ProcessInfo.processInfo.environment["JARVIS_VOICE_IDENTIFIER"] ?? ""
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let audioEngine = AVAudioEngine()
    private let synthesizer = AVSpeechSynthesizer()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var listening = false
    private var statusItem: NSStatusItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard URL(string: endpoint + "/jarvis/chat") != nil else {
            show("Set JARVIS_API_URL to your Render API URL before starting Jarvis Companion.")
            NSApp.terminate(nil)
            return
        }
        recognizer?.delegate = self
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem?.button?.title = "◉ Jarvis"
        requestPermissions()
        NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            if event.keyCode == 38 && modifiers.contains([.command, .option]) { self?.toggleListening() }
        }
        show("Jarvis Companion ready. Press ⌥⌘J to start and stop a voice turn.")
    }

    private func requestPermissions() {
        SFSpeechRecognizer.requestAuthorization { status in
            if status != .authorized { self.show("Speech Recognition permission is required for Jarvis Companion.") }
        }
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            if !granted { self.show("Microphone permission is required for Jarvis Companion.") }
        }
    }

    private func toggleListening() { listening ? finishListening() : startListening() }

    private func startListening() {
        guard !endpoint.isEmpty else { return }
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let request = recognitionRequest else { return }
        request.shouldReportPartialResults = true
        let input = audioEngine.inputNode
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in request.append(buffer) }
        do {
            audioEngine.prepare()
            try audioEngine.start()
            listening = true
            statusItem?.button?.title = "● Listening"
            recognitionTask = recognizer?.recognitionTask(with: request) { [weak self] result, error in
                if error != nil { self?.finishListening() }
                if result?.isFinal == true, let text = result?.bestTranscription.formattedString { self?.finishListening(); self?.askJarvis(text) }
            }
        } catch { show("Jarvis could not start the microphone.") }
    }

    private func finishListening() {
        guard listening else { return }
        let text = recognitionTask?.result?.bestTranscription.formattedString ?? ""
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        listening = false
        statusItem?.button?.title = "◉ Jarvis"
        if !text.isEmpty { askJarvis(text) }
    }

    private func askJarvis(_ message: String) {
        guard let url = URL(string: endpoint + "/jarvis/chat") else { return }
        statusItem?.button?.title = "◌ Jarvis"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["message": message])
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async { self?.statusItem?.button?.title = "◉ Jarvis" }
            guard error == nil, let data, let decoded = try? JSONDecoder().decode(JarvisResponse.self, from: data), decoded.success, let answer = decoded.data?.answer else {
                self?.show("Jarvis could not reach the deployed API. Confirm the Render deployment and API URL.")
                return
            }
            self?.speak(answer)
        }.resume()
    }

    private func speak(_ text: String) {
        let utterance = AVSpeechUtterance(string: text)
        if !voiceIdentifier.isEmpty { utterance.voice = AVSpeechSynthesisVoice(identifier: voiceIdentifier) }
        utterance.rate = 0.48
        synthesizer.stopSpeaking(at: .immediate)
        synthesizer.speak(utterance)
    }

    private func show(_ text: String) { DispatchQueue.main.async { self.statusItem?.button?.toolTip = text } }
}

let app = NSApplication.shared
let delegate = JarvisCompanion()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
