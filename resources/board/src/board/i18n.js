/* Every string the board shows. Thai is the default; `locale: "en"` in the boot payload switches. */
const th = {
  side: 'รายการข้อ', panel: 'ตัวเลือกและความเห็น', prev: 'ก่อนหน้า', next: 'ถัดไป',
  mode_options: 'เทียบแบบ', mode_sizes: 'เทียบขนาดจอ', mode_real: 'ขนาดจริง ลากขอบขวาปรับความกว้าง',
  zoom_out: 'ย่อ', zoom_in: 'ขยาย', zoom_100: 'กดเพื่อดู 100%', fit: 'พอดีจอ (Shift 1)', arrange: 'วางข้างกัน หรือบนล่าง',
  sync: 'เลื่อนและแตะพร้อมกัน', mini: 'แผนที่ย่อ (M)',
  tool_hand: 'มือจับ', tool_use: 'กดในจอ', tool_box: 'กรอบ', tool_edit: 'แก้คำ', tool_pin: 'ปักโน้ต',
  copy: 'คัดลอกให้ Claude', copied: 'คัดลอกแล้ว', copy_manual: 'กด ⌘C เพื่อคัดลอก', close: 'ปิด', cancel: 'ยกเลิก',
  archive: 'จัดเก็บ', decided_on: 'ตัดสินใจแล้ว {date}', archived_on: 'จัดเก็บแล้ว {date}', archive_title: 'จัดเก็บกระดานนี้',
  archive_decision: 'ย้ายไปประวัติเป็นตัดสินใจแล้ว เลือกตัวเลือกเพิ่มไม่ได้ ความเห็นยังเขียนต่อได้', archive_flow: 'ย้ายไปประวัติ ยังเปิดดูและเขียนความเห็นได้', product: 'กระดาน',
  old_round: 'รอบเก่า ดูอย่างเดียว', latest_round: 'กลับไปรอบล่าสุด', rounds: 'รอบของกระดานนี้', all_rounds: 'ดูทุกรอบ',
  round_n: 'รอบ {n}', open_round: 'เปิดรอบนี้', steps_n: '{n} ข้อ', answered_people: 'ตอบแล้ว {n} คน', loading: 'กำลังโหลด',
  fresh: 'มีอัปเดต โหลดใหม่', fresh_tip: 'Claude ส่งรอบนี้มาใหม่ตอนเปิดอยู่',
  updated: 'มีอัปเดต', new_step: 'ข้อใหม่', updated_since: 'มีอัปเดตตั้งแต่ที่ดูครั้งก่อน', new_since: 'ข้อนี้เพิ่มมาใหม่',
  pick: 'เลือก', picked: 'เลือกแล้ว', pick_all: 'เลือกทั้งหมด', clear: 'ล้าง', all: 'ทั้งหมด',
  skip: 'ข้ามข้อนี้', skip_sub: 'ไม่เลือก ให้ Claude เลือกเอง', skipped: 'ข้าม', read: 'อ่านแล้ว', read_box: 'อ่านแล้ว ไม่มีความเห็น',
  not_picked: 'ยังไม่เลือก', not_read: 'ยังไม่อ่าน', has_notes: 'มีความเห็น', comments_n: 'ความเห็น {n}',
  comment_ph: 'เขียนความเห็น', reply_ph: 'ตอบกลับ', send: 'ส่ง', reply: 'ตอบกลับ', edit: 'แก้', delete: 'ลบ', save: 'บันทึก',
  edited: 'แก้แล้ว', pin_ph: 'โน้ตตรงนี้', pin_ok: 'ปักโน้ต', box_ok: 'บันทึก', no_comments: 'ยังไม่มีความเห็น',
  delete_q: 'ลบความเห็นนี้', edits_n: 'แก้คำ {n} ที่',
  pin_here: 'ปักโน้ตตรงนี้', edit_here: 'แก้คำตรงนี้', zoom_here: 'ซูมไปที่จอนี้', dblclick: 'ดับเบิลคลิก', unpick: 'เอา {k} ออก', pick_k: 'เลือก {k}',
  view_100: 'ดู 100%', browser_menu: '⇧ + คลิกขวา เปิดเมนูของเบราว์เซอร์',
  hint: 'ซูม ⌘ หรือ Ctrl + เลื่อน ดับเบิลคลิกจอเพื่อซูมไปที่จอนั้น',
  width: 'กว้าง', page_width: 'หน้ากว้าง {w}', drag_width: 'ลากเพื่อปรับความกว้าง',
  dev_desktop: 'เดสก์ท็อป', dev_laptop: 'โน้ตบุ๊ก', dev_tablet: 'แท็บเล็ต', dev_phone: 'มือถือ',
  progress: '{name} {done} / {total}', last_seen: 'ดูล่าสุด {date}', here_now: 'เปิดอยู่ตอนนี้', you: 'คุณ',
  cant_open: 'เปิดกระดานนี้ไม่ได้ ({why})', save_failed: 'บันทึกไม่ได้ ลองอีกครั้ง', offline: 'ต่อเซิร์ฟเวอร์ไม่ได้',
  read_only: 'ดูอย่างเดียว',
  /* index */
  search: 'ค้นหาชื่อ เลขงาน หรือหัวข้อ', open: 'เปิดอยู่', history: 'ประวัติ', board: 'กระดาน', last_push: 'ส่งล่าสุด',
  answered: 'ตอบแล้ว', viewers: 'คนดู', no_boards: 'ยังไม่มีกระดาน', no_match: 'ไม่พบกระดานที่ตรงกับ “{q}”',
  people_n: '{n} คน', nobody: 'ยังไม่มีคนตอบ',
};

const en = {
  side: 'Steps', panel: 'Options and comments', prev: 'Previous', next: 'Next',
  mode_options: 'Compare options', mode_sizes: 'Compare screen sizes', mode_real: 'Real size, drag the right edge to resize',
  zoom_out: 'Zoom out', zoom_in: 'Zoom in', zoom_100: 'Click for 100%', fit: 'Fit (Shift 1)', arrange: 'Side by side or stacked',
  sync: 'Scroll and tap together', mini: 'Minimap (M)',
  tool_hand: 'Hand', tool_use: 'Interact', tool_box: 'Box', tool_edit: 'Edit text', tool_pin: 'Pin a note',
  copy: 'Copy for Claude', copied: 'Copied', copy_manual: 'Press ⌘C to copy', close: 'Close', cancel: 'Cancel',
  archive: 'Archive', decided_on: 'Decided {date}', archived_on: 'Archived {date}', archive_title: 'Archive this board',
  archive_decision: 'It moves to history as decided. Picks lock; comments stay open.', archive_flow: 'It moves to history. It stays readable and open to comments.', product: 'Kradan',
  old_round: 'Old round, read only', latest_round: 'Back to the latest round', rounds: 'Rounds of this board', all_rounds: 'All rounds',
  round_n: 'Round {n}', open_round: 'Open this round', steps_n: '{n} steps', answered_people: '{n} answered', loading: 'Loading',
  fresh: 'Updated, reload', fresh_tip: 'Claude pushed this round again while it was open',
  updated: 'Updated', new_step: 'New', updated_since: 'Updated since you last looked', new_since: 'This step is new',
  pick: 'Pick', picked: 'Picked', pick_all: 'Pick all', clear: 'Clear', all: 'All',
  skip: 'Skip this one', skip_sub: 'No preference, Claude picks', skipped: 'Skipped', read: 'Read', read_box: 'Read, no comment',
  not_picked: 'Not picked', not_read: 'Not read', has_notes: 'Has comments', comments_n: 'Comments {n}',
  comment_ph: 'Write a comment', reply_ph: 'Reply', send: 'Send', reply: 'Reply', edit: 'Edit', delete: 'Delete', save: 'Save',
  edited: 'edited', pin_ph: 'Note here', pin_ok: 'Pin', box_ok: 'Save', no_comments: 'No comments yet',
  delete_q: 'Delete this comment', edits_n: '{n} text edits',
  pin_here: 'Pin a note here', edit_here: 'Edit text here', zoom_here: 'Zoom to this screen', dblclick: 'Double-click', unpick: 'Unpick {k}', pick_k: 'Pick {k}',
  view_100: 'View 100%', browser_menu: '⇧ + right-click opens the browser menu',
  hint: 'Zoom with ⌘ or Ctrl + scroll. Double-click a screen to zoom to it.',
  width: 'Width', page_width: 'Page width {w}', drag_width: 'Drag to resize',
  dev_desktop: 'Desktop', dev_laptop: 'Laptop', dev_tablet: 'Tablet', dev_phone: 'Phone',
  progress: '{name} {done} / {total}', last_seen: 'Last seen {date}', here_now: 'Here now', you: 'You',
  cant_open: 'Could not open this board ({why})', save_failed: 'Could not save, try again', offline: 'Cannot reach the server',
  read_only: 'Read only',
  search: 'Search title, task or step', open: 'Open', history: 'History', board: 'Board', last_push: 'Last push',
  answered: 'Answered', viewers: 'Viewers', no_boards: 'No boards yet', no_match: 'No board matches “{q}”',
  people_n: '{n} people', nobody: 'No answers yet',
};

const MAPS = { th, en };
let current = th;
export const LOCALE = { code: 'th' };

export function setLocale(code) {
  current = MAPS[code] || th;
  LOCALE.code = MAPS[code] ? code : 'th';
}

export function t(key, vars = {}) {
  const s = current[key] ?? th[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export const strings = MAPS;
