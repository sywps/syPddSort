import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
export function passwordHash(password, salt = randomBytes(16).toString('hex')) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('密码需要 12—128 个字符');
    return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, hash) {
    try {
        const [salt] = hash.split(':');
        return timingSafeEqual(Buffer.from(passwordHash(password, salt)), Buffer.from(hash));
    } catch { return false; }
}

export function openStore(file) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(file);
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL, expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, bytes BLOB NOT NULL);`);
    db.prepare('INSERT OR IGNORE INTO state VALUES (1, ?)').run(JSON.stringify({
        schemaVersion: 1, users: [], tasks: [], experiments: [], resources: [], audit: [],
        assignments: [], events: [], budget: 30,
    }));
    const read = () => {
        const state = JSON.parse(db.prepare('SELECT document FROM state WHERE id=1').get().document);
        if (state.schemaVersion !== 1) throw new Error('数据库版本不受支持，停止启动');
        return state;
    };
    read();
    return {
        read,
        change(fn) {
            db.exec('BEGIN IMMEDIATE');
            try {
                const state = read();
                const result = fn(state);
                db.prepare('UPDATE state SET document=? WHERE id=1').run(JSON.stringify(state));
                db.exec('COMMIT');
                return result;
            } catch (error) { db.exec('ROLLBACK'); throw error; }
        },
        putAsset(id, bytes) { db.prepare('INSERT INTO assets VALUES (?, ?)').run(id, bytes); },
        asset(id) { return db.prepare('SELECT bytes FROM assets WHERE id=?').get(id)?.bytes; },
        session(userId) {
            const token = randomBytes(32).toString('hex');
            db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
            db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), userId, Date.now() + 12 * 3600000);
            return token;
        },
        userForSession(token) {
            const row = db.prepare('SELECT userId FROM sessions WHERE token=? AND expires>?').get(digest(token), Date.now());
            return row ? read().users.find(u => u.id === row.userId && !u.disabled) : null;
        },
        logout(token) { db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token)); },
        revoke(userId) { db.prepare('DELETE FROM sessions WHERE userId=?').run(userId); },
        close() { db.close(); },
    };
}
