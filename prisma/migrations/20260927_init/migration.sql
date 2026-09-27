-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_currency" TEXT NOT NULL DEFAULT 'AUD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payer" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contract_terms" TEXT NOT NULL DEFAULT '{}',
    "payment_terms_days" INTEGER NOT NULL DEFAULT 30,
    "billing_email" TEXT,
    "billing_phone" TEXT,
    "billing_address" TEXT,
    "abn" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "preferred_name" TEXT,
    "address_line" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lng" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'Australia/Sydney',
    "phone" TEXT,
    "gender" TEXT,
    "date_of_birth" TEXT,
    "next_of_kin_name" TEXT,
    "next_of_kin_phone" TEXT,
    "next_of_kin_relation" TEXT,
    "funding_type_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingType" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "preferred_name" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "home_lat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "home_lng" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "address" TEXT,
    "date_of_birth" TEXT,
    "gender" TEXT,
    "ethnicity" TEXT,
    "languages" TEXT,
    "next_of_kin_name" TEXT,
    "next_of_kin_phone" TEXT,
    "next_of_kin_relation" TEXT,
    "role_id" TEXT,
    "case_manager_id" TEXT,
    "worker_notes" TEXT,
    "admin_notes" TEXT,
    "engagement_start_date" TEXT,
    "engagement_end_date" TEXT,
    "dont_rehire" BOOLEAN NOT NULL DEFAULT false,
    "engagement_notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerRole" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerDocument" (
    "id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL DEFAULT 'other',
    "file_path" TEXT,
    "file_name" TEXT,
    "original_name" TEXT,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "expiry_date" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" TEXT,

    CONSTRAINT "WorkerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerIncident" (
    "id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "incident_date" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'low',
    "file_path" TEXT,
    "file_name" TEXT,
    "original_name" TEXT,
    "mime_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "WorkerIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerSkill" (
    "id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "certified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "WorkerSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerAvailability" (
    "id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "day_of_week" INTEGER,
    "specific_date" TEXT,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WorkerAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WageRate" (
    "id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "rate_type" TEXT NOT NULL DEFAULT 'hourly',
    "amount" DOUBLE PRECISION NOT NULL,
    "overtime_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),

    CONSTRAINT "WageRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementTemplate" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "recurrence_rule" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "active_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_until" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RequirementTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRequirement" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "template_id" TEXT,
    "shift_date" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending_admin_approval',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),

    CONSTRAINT "ClientRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementSkill" (
    "id" TEXT NOT NULL,
    "client_requirement_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RequirementSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "client_requirement_id" TEXT NOT NULL,
    "slot_number" INTEGER NOT NULL,
    "scheduled_start" TIMESTAMP(3) NOT NULL,
    "scheduled_end" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" TEXT,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeLog" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "clock_in_at" TIMESTAMP(3) NOT NULL,
    "clock_out_at" TIMESTAMP(3),
    "clock_in_lat" DOUBLE PRECISION NOT NULL,
    "clock_in_lng" DOUBLE PRECISION NOT NULL,
    "clock_out_lat" DOUBLE PRECISION,
    "clock_out_lng" DOUBLE PRECISION,
    "geofence_passed" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending_approval',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "billed_at" TIMESTAMP(3),

    CONSTRAINT "TimeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeLogAdjustment" (
    "id" TEXT NOT NULL,
    "time_log_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "original_hours" DOUBLE PRECISION NOT NULL,
    "corrected_hours" DOUBLE PRECISION NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeLogAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillRate" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "client_id" TEXT,
    "skill_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "rate_type" TEXT NOT NULL DEFAULT 'hourly',
    "amount" DOUBLE PRECISION NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),

    CONSTRAINT "BillRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "payer_id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "billing_period_start" TIMESTAMP(3) NOT NULL,
    "billing_period_end" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3) NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "time_log_id" TEXT NOT NULL,
    "worker_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "shift_date" TEXT NOT NULL,
    "shift_start_time" TEXT,
    "shift_end_time" TEXT,
    "hours" DOUBLE PRECISION NOT NULL,
    "bill_rate_applied" DOUBLE PRECISION NOT NULL,
    "line_total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'bank_transfer',
    "reference_number" TEXT NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'coordinator',
    "linked_worker_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before_json" TEXT,
    "after_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborConfig" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "max_daily_hours" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "max_weekly_hours" DOUBLE PRECISION NOT NULL DEFAULT 38.0,
    "min_rest_hours" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "geofence_radius_meters" DOUBLE PRECISION NOT NULL DEFAULT 150.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaborConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payer_agency_id_idx" ON "Payer"("agency_id");

-- CreateIndex
CREATE INDEX "Client_payer_id_idx" ON "Client"("payer_id");

-- CreateIndex
CREATE INDEX "Client_funding_type_id_idx" ON "Client"("funding_type_id");

-- CreateIndex
CREATE INDEX "FundingType_agency_id_idx" ON "FundingType"("agency_id");

-- CreateIndex
CREATE UNIQUE INDEX "FundingType_agency_id_name_key" ON "FundingType"("agency_id", "name");

-- CreateIndex
CREATE INDEX "Worker_agency_id_idx" ON "Worker"("agency_id");

-- CreateIndex
CREATE INDEX "Worker_case_manager_id_idx" ON "Worker"("case_manager_id");

-- CreateIndex
CREATE INDEX "WorkerRole_agency_id_idx" ON "WorkerRole"("agency_id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerRole_agency_id_name_key" ON "WorkerRole"("agency_id", "name");

-- CreateIndex
CREATE INDEX "WorkerDocument_worker_id_idx" ON "WorkerDocument"("worker_id");

-- CreateIndex
CREATE INDEX "WorkerIncident_worker_id_idx" ON "WorkerIncident"("worker_id");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerSkill_worker_id_skill_id_key" ON "WorkerSkill"("worker_id", "skill_id");

-- CreateIndex
CREATE INDEX "WorkerAvailability_worker_id_idx" ON "WorkerAvailability"("worker_id");

-- CreateIndex
CREATE INDEX "WageRate_worker_id_idx" ON "WageRate"("worker_id");

-- CreateIndex
CREATE INDEX "RequirementTemplate_client_id_idx" ON "RequirementTemplate"("client_id");

-- CreateIndex
CREATE INDEX "ClientRequirement_client_id_idx" ON "ClientRequirement"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementSkill_client_requirement_id_skill_id_key" ON "RequirementSkill"("client_requirement_id", "skill_id");

-- CreateIndex
CREATE INDEX "Shift_client_requirement_id_idx" ON "Shift"("client_requirement_id");

-- CreateIndex
CREATE INDEX "Assignment_shift_id_idx" ON "Assignment"("shift_id");

-- CreateIndex
CREATE INDEX "Assignment_worker_id_idx" ON "Assignment"("worker_id");

-- CreateIndex
CREATE INDEX "TimeLog_assignment_id_idx" ON "TimeLog"("assignment_id");

-- CreateIndex
CREATE INDEX "TimeLogAdjustment_time_log_id_idx" ON "TimeLogAdjustment"("time_log_id");

-- CreateIndex
CREATE INDEX "BillRate_payer_id_idx" ON "BillRate"("payer_id");

-- CreateIndex
CREATE INDEX "Invoice_payer_id_idx" ON "Invoice"("payer_id");

-- CreateIndex
CREATE INDEX "Invoice_agency_id_idx" ON "Invoice"("agency_id");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoice_id_idx" ON "InvoiceLineItem"("invoice_id");

-- CreateIndex
CREATE INDEX "Payment_invoice_id_idx" ON "Payment"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_linked_worker_id_key" ON "User"("linked_worker_id");

-- CreateIndex
CREATE INDEX "User_agency_id_idx" ON "User"("agency_id");

-- CreateIndex
CREATE INDEX "AuditLog_agency_id_idx" ON "AuditLog"("agency_id");

-- CreateIndex
CREATE UNIQUE INDEX "LaborConfig_agency_id_key" ON "LaborConfig"("agency_id");

-- AddForeignKey
ALTER TABLE "Payer" ADD CONSTRAINT "Payer_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "Payer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_funding_type_id_fkey" FOREIGN KEY ("funding_type_id") REFERENCES "FundingType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingType" ADD CONSTRAINT "FundingType_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "WorkerRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_case_manager_id_fkey" FOREIGN KEY ("case_manager_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerRole" ADD CONSTRAINT "WorkerRole_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDocument" ADD CONSTRAINT "WorkerDocument_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerDocument" ADD CONSTRAINT "WorkerDocument_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerIncident" ADD CONSTRAINT "WorkerIncident_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerIncident" ADD CONSTRAINT "WorkerIncident_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerSkill" ADD CONSTRAINT "WorkerSkill_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerSkill" ADD CONSTRAINT "WorkerSkill_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerAvailability" ADD CONSTRAINT "WorkerAvailability_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WageRate" ADD CONSTRAINT "WageRate_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementTemplate" ADD CONSTRAINT "RequirementTemplate_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequirement" ADD CONSTRAINT "ClientRequirement_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequirement" ADD CONSTRAINT "ClientRequirement_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "RequirementTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequirement" ADD CONSTRAINT "ClientRequirement_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementSkill" ADD CONSTRAINT "RequirementSkill_client_requirement_id_fkey" FOREIGN KEY ("client_requirement_id") REFERENCES "ClientRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementSkill" ADD CONSTRAINT "RequirementSkill_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_client_requirement_id_fkey" FOREIGN KEY ("client_requirement_id") REFERENCES "ClientRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeLog" ADD CONSTRAINT "TimeLog_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeLog" ADD CONSTRAINT "TimeLog_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeLogAdjustment" ADD CONSTRAINT "TimeLogAdjustment_time_log_id_fkey" FOREIGN KEY ("time_log_id") REFERENCES "TimeLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeLogAdjustment" ADD CONSTRAINT "TimeLogAdjustment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillRate" ADD CONSTRAINT "BillRate_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "Payer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillRate" ADD CONSTRAINT "BillRate_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillRate" ADD CONSTRAINT "BillRate_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "Payer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_time_log_id_fkey" FOREIGN KEY ("time_log_id") REFERENCES "TimeLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_linked_worker_id_fkey" FOREIGN KEY ("linked_worker_id") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborConfig" ADD CONSTRAINT "LaborConfig_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

