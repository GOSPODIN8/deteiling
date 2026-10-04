import { db, type Client } from './db.js';

export async function audit(
  userId: number,
  action: 'create' | 'update' | 'delete',
  entity: string,
  entityId: number | null,
  summary: string,
  c: Client = db,
) {
  await c.query(
    'insert into audit_log (user_id, action, entity, entity_id, summary) values ($1, $2, $3, $4, $5)',
    [userId, action, entity, entityId, summary],
  );
}
