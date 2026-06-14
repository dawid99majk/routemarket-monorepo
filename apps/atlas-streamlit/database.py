import sqlite3
import os
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("DB_PATH", "data/routes.db")

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            created_at TEXT
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS routes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            title TEXT,
            profile TEXT,
            gpx_data TEXT,
            guide_data TEXT,
            created_at TEXT,
            FOREIGN KEY (username) REFERENCES users(username)
        )
    ''')
    
    conn.commit()
    conn.close()
    logger.info(f"Database initialized at {DB_PATH}")

def save_route(username: str, title: str, profile: str, gpx_data: str, guide_data: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Ensure user exists
    cursor.execute('INSERT OR IGNORE INTO users (username, created_at) VALUES (?, ?)', 
                   (username, datetime.now().isoformat()))
                   
    cursor.execute('''
        INSERT INTO routes (username, title, profile, gpx_data, guide_data, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (username, title, profile, gpx_data, guide_data, datetime.now().isoformat()))
    
    conn.commit()
    conn.close()

def get_user_routes(username: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, title, profile, created_at FROM routes
        WHERE username = ?
        ORDER BY created_at DESC
    ''', (username,))
    
    routes = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return routes

def get_route_by_id(route_id: int):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM routes WHERE id = ?', (route_id,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return dict(row)
    return None
