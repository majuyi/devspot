-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN     "deadlineChangedAt" TIMESTAMP(3),
ADD COLUMN     "previousDeadlineAt" TIMESTAMP(3),
ADD COLUMN     "sourceDeadlineAt" TIMESTAMP(3);

