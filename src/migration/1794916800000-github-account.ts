import { MigrationInterface, QueryRunner } from "typeorm";

export class GithubAccount1794916800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    await queryRunner.query('ALTER TABLE "users" ADD COLUMN "githubId" varchar UNIQUE');
  }
  async down(queryRunner: QueryRunner) {
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "githubId"');
  }
}
