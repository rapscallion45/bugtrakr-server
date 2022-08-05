import {MigrationInterface, QueryRunner} from "typeorm";

export class bugtrakrUserVerification1658514866041 implements MigrationInterface {
    name = 'bugtrakrUserVerification1658514866041'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "verified" boolean`);
        await queryRunner.query(`ALTER TABLE "users" ADD "emailVerificationCodeHash" text`);
        await queryRunner.query(`ALTER TABLE "users" ADD "emailVerificationCodeExpires" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" ADD "resetVerificationCodeHash" text`);
        await queryRunner.query(`ALTER TABLE "users" ADD "resetVerificationCodeExpires" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "resetVerificationCodeExpires"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "resetVerificationCodeHash"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "emailVerificationCodeExpires"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "emailVerificationCodeHash"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "verified"`);
    }

}
