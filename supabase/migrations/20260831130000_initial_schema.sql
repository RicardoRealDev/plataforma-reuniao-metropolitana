-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'LIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AgendaItemStatus" AS ENUM ('PENDING', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('MANUAL', 'CAMERA');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');

-- CreateTable
CREATE TABLE "Council" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Council_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "councilId" TEXT NOT NULL,
    "segmento" TEXT NOT NULL,
    "ente" TEXT NOT NULL,
    "representante" TEXT NOT NULL,
    "pesoVoto" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "councilId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "livekitRoomName" TEXT NOT NULL,
    "sheetId" TEXT,
    "sheetUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "status" "AgendaItemStatus" NOT NULL DEFAULT 'PENDING',
    "candidato" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "AgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceEvent" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "source" "AttendanceSource" NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoteSnapshot" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "wasPresent" BOOLEAN NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "operatorId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingMinutes" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingMinutes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Council_name_key" ON "Council"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Council_slug_key" ON "Council"("slug");

-- CreateIndex
CREATE INDEX "Member_councilId_idx" ON "Member"("councilId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_livekitRoomName_key" ON "Meeting"("livekitRoomName");

-- CreateIndex
CREATE INDEX "Meeting_councilId_idx" ON "Meeting"("councilId");

-- CreateIndex
CREATE INDEX "AgendaItem_meetingId_idx" ON "AgendaItem"("meetingId");

-- CreateIndex
CREATE INDEX "AttendanceEvent_meetingId_memberId_idx" ON "AttendanceEvent"("meetingId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "VoteSnapshot_agendaItemId_memberId_key" ON "VoteSnapshot"("agendaItemId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_agendaItemId_memberId_key" ON "Vote"("agendaItemId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingMinutes_meetingId_key" ON "MeetingMinutes"("meetingId");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteSnapshot" ADD CONSTRAINT "VoteSnapshot_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoteSnapshot" ADD CONSTRAINT "VoteSnapshot_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingMinutes" ADD CONSTRAINT "MeetingMinutes_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
