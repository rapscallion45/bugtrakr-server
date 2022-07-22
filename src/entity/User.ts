import { Entity, Column } from "typeorm";
import BaseModel from "./BaseModel";

@Entity({ name: "users" })
export class User extends BaseModel {
  @Column({ type: "varchar", length: 20 })
  username: string;

  @Column()
  passwordHash: string;

  @Column()
  email: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  verified: boolean;

  @Column({ type: "text", nullable: true })
  emailVerificationCodeHash: string;

  @Column({ type: "timestamp", nullable: true })
  emailVerificationCodeExpires: Date;

  @Column({ type: "text", nullable: true })
  resetVerificationCodeHash: string;

  @Column({ type: "timestamp", nullable: true })
  resetVerificationCodeExpires: Date;
}
