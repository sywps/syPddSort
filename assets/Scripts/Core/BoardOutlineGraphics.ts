import { _decorator, Graphics } from 'cc';

// Keep the serialized component identity and board-only call sites intact.
// Buffer creation/upload/destruction must stay inside Graphics: release builds
// mangle its internal Impl methods independently from application scripts.
@_decorator.ccclass('BoardOutlineGraphics')
export class BoardOutlineGraphics extends Graphics {}
