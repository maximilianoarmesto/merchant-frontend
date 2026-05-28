import ChatPanel from "@/components/ChatPanel";

export default function ChatPage() {
  return (
    <div>
      <div className="section-heading">
        <div className="intro">
          <span className="eyebrow">Assistant</span>
          <h1>Chat</h1>
          <p>
            Browse past conversations or start a new chat. History is stored in
            your browser.
          </p>
        </div>
      </div>
      <ChatPanel />
    </div>
  );
}
