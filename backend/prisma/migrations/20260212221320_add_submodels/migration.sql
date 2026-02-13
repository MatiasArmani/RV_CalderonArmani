-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "submodelId" TEXT;

-- CreateTable
CREATE TABLE "submodels" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submodels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submodels_companyId_idx" ON "submodels"("companyId");

-- CreateIndex
CREATE INDEX "submodels_versionId_idx" ON "submodels"("versionId");

-- CreateIndex
CREATE INDEX "assets_submodelId_idx" ON "assets"("submodelId");

-- AddForeignKey
ALTER TABLE "submodels" ADD CONSTRAINT "submodels_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submodels" ADD CONSTRAINT "submodels_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_submodelId_fkey" FOREIGN KEY ("submodelId") REFERENCES "submodels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
