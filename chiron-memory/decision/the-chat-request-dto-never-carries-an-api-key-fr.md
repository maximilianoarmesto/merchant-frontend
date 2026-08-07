---
id: e9245401-491f-4ebc-b66d-cc1a31f913b8-1
type: decision
title: The chat request DTO never carries an API key from the client.
tags: [decision]
created: 2026-08-07
resource: lib/dto/chat.ts
---
The chat request DTO never carries an API key from the client.

## Why
The server resolves the merchant's stored key itself, so the key never needs to transit the browser even for a single request.

## Where
lib/dto/chat.ts
