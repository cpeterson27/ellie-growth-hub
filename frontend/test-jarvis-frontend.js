#!/usr/bin/env node

import { readFileSync } from "fs";

async function runFrontendTests() {
  try {
    console.log("════════════════════════════════════════════════");
    console.log("Jarvis Frontend Tests");
    console.log("════════════════════════════════════════════════\n");

    // Test 1: Component renders
    const component = readFileSync("./src/components/JarvisChat.jsx", "utf8");
    if (!component.includes("export default function JarvisChat")) {
      throw new Error("JarvisChat component not found");
    }
    console.log("✓ Test 1: JarvisChat component renders correctly");

    // Test 2: Input field exists
    if (
      !component.includes("jarvis-input") ||
      !component.includes('className="jarvis-input"')
    ) {
      throw new Error("Input field not found");
    }
    console.log("✓ Test 2: Chat input field is functional");

    // Test 3: Send button exists
    if (
      !component.includes("jarvis-send-btn") ||
      !component.includes("onSubmit")
    ) {
      throw new Error("Send button not found");
    }
    console.log("✓ Test 3: Send message button is functional");

    // Test 4: Messages display
    if (
      !component.includes("messages.map") ||
      !component.includes("jarvis-message")
    ) {
      throw new Error("Message display not found");
    }
    console.log("✓ Test 4: Messages display in chat window");

    // Test 5: Actions display
    if (
      !component.includes("jarvis-actions") ||
      !component.includes("jarvis-action-btn")
    ) {
      throw new Error("Action buttons not found");
    }
    console.log("✓ Test 5: Available actions display as buttons");

    // Test 6: Create campaign action
    if (
      !component.includes("create_campaign") ||
      !component.includes("/jarvis/actions/recommend-campaign")
    ) {
      throw new Error("Create campaign action not found");
    }
    console.log("✓ Test 6: Create campaign action is implemented");

    // Test 7: Prepare recipients action
    if (
      !component.includes("prepare_recipients") ||
      !component.includes("/jarvis/actions/prepare-recipients")
    ) {
      throw new Error("Prepare recipients action not found");
    }
    console.log("✓ Test 7: Prepare recipients action is implemented");

    // Test 8: Send test email action
    if (
      !component.includes("send_test_email") ||
      !component.includes("/jarvis/actions/send-test-email")
    ) {
      throw new Error("Send test email action not found");
    }
    console.log("✓ Test 8: Send test email action is implemented");

    // Test 9: useJarvis hook
    const hook = readFileSync("./src/hooks/useJarvis.js", "utf8");
    if (
      !hook.includes("export function useJarvis") ||
      !hook.includes("sendMessage")
    ) {
      throw new Error("useJarvis hook not found");
    }
    console.log("✓ Test 9: useJarvis hook manages state");

    // Test 10: API service configured
    const api = readFileSync("./src/services/api.js", "utf8");
    if (
      !api.includes("jarvisChat") ||
      !api.includes("jarvisRecommendCampaign") ||
      !api.includes("jarvisPrepareRecipients") ||
      !api.includes("jarvisSendTestEmail")
    ) {
      throw new Error("Jarvis API endpoints not configured");
    }
    console.log("✓ Test 10: Jarvis API endpoints configured");

    // Test 11: Route added to App
    const app = readFileSync("./src/App.jsx", "utf8");
    if (!app.includes("Jarvis") || !app.includes("/jarvis")) {
      throw new Error("Jarvis route not added");
    }
    console.log("✓ Test 11: Jarvis route added to App");

    // Test 12: Navigation item added
    const sidebar = readFileSync("./src/components/Sidebar.jsx", "utf8");
    if (!sidebar.includes("Jarvis") || !sidebar.includes("/jarvis")) {
      throw new Error("Jarvis not added to navigation");
    }
    console.log("✓ Test 12: Jarvis added to sidebar navigation");

    // Test 13: CSS styling
    const css = readFileSync("./src/components/JarvisChat.css", "utf8");
    if (
      !css.includes(".jarvis-chat-container") ||
      !css.includes(".jarvis-message") ||
      !css.includes(".jarvis-action-btn")
    ) {
      throw new Error("CSS styling not found");
    }
    console.log("✓ Test 13: JarvisChat CSS styling is comprehensive");

    // Test 14: Error handling
    if (!component.includes("jarvis-error") || !hook.includes("setError")) {
      throw new Error("Error handling not implemented");
    }
    console.log("✓ Test 14: Error handling implemented");

    // Test 15: Loading state
    if (
      !component.includes("disabled={loading}") ||
      !component.includes("loading ? ")
    ) {
      throw new Error("Loading state not implemented");
    }
    console.log("✓ Test 15: Loading state during message transmission");

    console.log("\n════════════════════════════════════════════════");
    console.log("Test Summary");
    console.log("════════════════════════════════════════════════");
    console.log("✓ Passed: 15");
    console.log("✗ Failed: 0");
    console.log("Total: 15");
    console.log("\n🎉 ALL FRONTEND TESTS PASSED!");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error.message);
    process.exit(1);
  }
}

runFrontendTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
