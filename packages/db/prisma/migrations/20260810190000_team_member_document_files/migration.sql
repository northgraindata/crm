ALTER TABLE "teamMemberDocument"
ADD COLUMN "fileKey" TEXT,
ADD COLUMN "fileName" TEXT,
ADD COLUMN "fileType" TEXT,
ADD COLUMN "fileSize" INTEGER;

CREATE UNIQUE INDEX "teamMemberDocument_fileKey_key" ON "teamMemberDocument"("fileKey");
