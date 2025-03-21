# Example usage

### Rendering pure components in order on Storybook view

```ts
for await (const chunk of streamToolUseChunks(toolUseExample1Chunks)) {
  console.log(chunk);
  snapshot = buildSnapshot(snapshot, chunk, chatLifecycleState);
  return ChatMessages(snapshot);
}
```

### Latest snapshot

```ts
function buildSnapshot(snapshot, chunk, chatLifecycleState) {
  if (chatLifecycleState.justGotToolName) {
    snapshot.toolArgs += chunk.tool_args;
  }
  return snapshot;
}
```

### Update chatLifecycleState

```ts
function updateChatLifecycleState(chatLifecycleState, chunk) {
  if ((chatLifecycleState.justGotToolName = true)) {
    if ((chunk.tool_args = null)) {
      chatLifecycleState.justGotToolName = false;
      chatLifecycleState.justGotToolArgs = true;
    }
  }
  return chatLifecycleState;
}
```
