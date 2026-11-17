import 'reflect-metadata';
import { Connection, createConnection } from 'typeorm';
import options from "../ormconfig";
import { Bug } from './entity/Bug';
import { Member } from './entity/Member';
import { Note } from './entity/Note';
import { Project } from './entity/Project';
import { User } from './entity/User';

let pending: Promise<Connection> | undefined;

export function connectToDB(): Promise<Connection> {
  if (!pending) {
    pending = createConnection({
        ...options,
        entities: [Bug, Member, Note, Project, User],
        migrations: [],
      })
      .catch(error => {
        console.error("Database connection failed", { name: error.name, code: error.code, databaseUrlConfigured: Boolean(process.env.DATABASE_URL) });
        pending = undefined;
        throw error;
      });
  }
  return pending;
}
