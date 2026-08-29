import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding staffing software database...');

  // Clean existing
  await prisma.auditLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceLineItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.billRate.deleteMany();
  await prisma.timeLogAdjustment.deleteMany();
  await prisma.timeLog.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.requirementSkill.deleteMany();
  await prisma.clientRequirement.deleteMany();
  await prisma.requirementTemplate.deleteMany();
  await prisma.wageRate.deleteMany();
  await prisma.workerAvailability.deleteMany();
  await prisma.workerSkill.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.user.deleteMany();
  await prisma.worker.deleteMany();
  await prisma.client.deleteMany();
  await prisma.fundingType.deleteMany();
  await prisma.payer.deleteMany();
  await prisma.laborConfig.deleteMany();
  await prisma.agency.deleteMany();

  // 1. Create Agency
  const agency = await prisma.agency.create({
    data: {
      name: 'Apex Staffing Solutions Australia',
      default_currency: 'AUD',
    },
  });

  // 2. Create Labor Config
  await prisma.laborConfig.create({
    data: {
      agency_id: agency.id,
      max_daily_hours: 10.0,
      max_weekly_hours: 38.0,
      min_rest_hours: 10.0,
      geofence_radius_meters: 150.0,
    },
  });

  // 2b. Create default Funding Types
  const ftNDIS = await prisma.fundingType.create({
    data: { agency_id: agency.id, name: 'NDIS' },
  });
  const ftSAH = await prisma.fundingType.create({
    data: { agency_id: agency.id, name: 'Support at Home' },
  });

  // 3. Create Payers
  const payerHealth = await prisma.payer.create({
    data: {
      agency_id: agency.id,
      name: 'HealthFirst Australia Group',
      contract_terms: JSON.stringify({ tier: 'enterprise', discount: 0.05 }),
      payment_terms_days: 30,
      billing_email: 'billing@healthfirst.com.au',
      billing_phone: '+61 2 9000 1111',
      billing_address: 'Level 5, 1 Market St, Sydney NSW 2000',
      abn: '12 345 678 901',
    },
  });

  const payerLogistics = await prisma.payer.create({
    data: {
      agency_id: agency.id,
      name: 'Metro Logistics & Supply',
      contract_terms: JSON.stringify({ tier: 'standard' }),
      payment_terms_days: 14,
      billing_email: 'accounts@metrologistics.com.au',
      billing_phone: '+61 2 8000 2222',
      billing_address: '45 Industrial Ave, Chullora NSW 2190',
      abn: '98 765 432 109',
    },
  });

  // 4. Create Clients
  const clientHospital = await prisma.client.create({
    data: {
      payer_id: payerHealth.id,
      name: 'Margaret Thompson',
      preferred_name: 'Maggie',
      address_line: '390 Victoria St, Darlinghurst NSW 2010',
      lat: -33.8791,
      lng: 151.2205,
      timezone: 'Australia/Sydney',
      phone: '+61 400 100 200',
      gender: 'female',
      date_of_birth: '1942-03-15',
      next_of_kin_name: 'James Thompson',
      next_of_kin_phone: '+61 400 100 201',
      next_of_kin_relation: 'Son',
      funding_type_id: ftNDIS.id,
      notes: 'Prefers female workers. Requires assistance with morning routine. Allergic to latex gloves.',
    },
  });

  const clientClinic = await prisma.client.create({
    data: {
      payer_id: payerHealth.id,
      name: 'Robert Chan',
      preferred_name: 'Bobby',
      address_line: '1 Collins St, North Sydney NSW 2060',
      lat: -33.8385,
      lng: 151.2072,
      timezone: 'Australia/Sydney',
      phone: '+61 400 300 400',
      gender: 'male',
      date_of_birth: '1958-07-22',
      next_of_kin_name: 'Linda Chan',
      next_of_kin_phone: '+61 400 300 401',
      next_of_kin_relation: 'Spouse',
      funding_type_id: ftSAH.id,
      notes: 'Speaks Cantonese. Prefer workers familiar with Asian dietary requirements.',
    },
  });

  const clientWarehouse = await prisma.client.create({
    data: {
      payer_id: payerLogistics.id,
      name: 'Chullora Distribution Centre',
      address_line: '12 Freight Road, Chullora NSW 2190',
      lat: -33.8982,
      lng: 151.0451,
      timezone: 'Australia/Sydney',
      notes: 'Forklift-certified workers only for warehouse floor. Induction required on first visit.',
    },
  });

  // 5. Create Skills
  const skillRN = await prisma.skill.create({ data: { name: 'RN Registered Nurse', category: 'Healthcare' } });
  const skillEN = await prisma.skill.create({ data: { name: 'EN Enrolled Nurse', category: 'Healthcare' } });
  const skillForklift = await prisma.skill.create({ data: { name: 'Forklift Operator (LF)', category: 'Logistics' } });
  const skillWhs = await prisma.skill.create({ data: { name: 'Warehouse Operative', category: 'Logistics' } });

  // 6. Create Workers & Skills & Availability & Wage Rates
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // Worker 1: Sarah Jenkins (RN Nurse)
  const workerSarah = await prisma.worker.create({
    data: {
      agency_id: agency.id,
      name: 'Sarah Jenkins',
      email: 'sarah.jenkins@example.com',
      phone: '+61 400 111 222',
      home_lat: -33.875,
      home_lng: 151.215,
      status: 'active',
    },
  });
  await prisma.workerSkill.create({
    data: {
      worker_id: workerSarah.id,
      skill_id: skillRN.id,
      certified_at: new Date('2024-01-10'),
      expires_at: new Date('2027-01-10'),
    },
  });
  // Available Mon-Fri 06:00 to 20:00
  for (let day = 1; day <= 5; day++) {
    await prisma.workerAvailability.create({
      data: {
        worker_id: workerSarah.id,
        day_of_week: day,
        start_time: '06:00',
        end_time: '20:00',
        is_available: true,
      },
    });
  }
  await prisma.wageRate.create({
    data: {
      worker_id: workerSarah.id,
      currency: 'AUD',
      rate_type: 'hourly',
      amount: 48.50,
      overtime_multiplier: 1.5,
      effective_from: new Date('2024-01-01'),
    },
  });

  // Worker 2: David Miller (EN Nurse)
  const workerDavid = await prisma.worker.create({
    data: {
      agency_id: agency.id,
      name: 'David Miller',
      email: 'david.miller@example.com',
      phone: '+61 400 222 333',
      home_lat: -33.882,
      home_lng: 151.228,
      status: 'active',
    },
  });
  await prisma.workerSkill.create({
    data: {
      worker_id: workerDavid.id,
      skill_id: skillEN.id,
      certified_at: new Date('2023-05-15'),
      expires_at: new Date('2026-05-15'),
    },
  });
  for (let day = 0; day <= 6; day++) {
    await prisma.workerAvailability.create({
      data: {
        worker_id: workerDavid.id,
        day_of_week: day,
        start_time: '07:00',
        end_time: '19:00',
        is_available: true,
      },
    });
  }
  await prisma.wageRate.create({
    data: {
      worker_id: workerDavid.id,
      currency: 'AUD',
      rate_type: 'hourly',
      amount: 38.00,
      overtime_multiplier: 1.5,
      effective_from: new Date('2024-01-01'),
    },
  });

  // Worker 3: Alex Wong (Forklift + Whs)
  const workerAlex = await prisma.worker.create({
    data: {
      agency_id: agency.id,
      name: 'Alex Wong',
      email: 'alex.wong@example.com',
      phone: '+61 400 333 444',
      home_lat: -33.892,
      home_lng: 151.050,
      status: 'active',
    },
  });
  await prisma.workerSkill.create({
    data: {
      worker_id: workerAlex.id,
      skill_id: skillForklift.id,
      certified_at: new Date('2023-08-01'),
      expires_at: new Date('2026-08-01'),
    },
  });
  await prisma.workerSkill.create({
    data: {
      worker_id: workerAlex.id,
      skill_id: skillWhs.id,
      certified_at: new Date('2022-01-01'),
    },
  });
  for (let day = 1; day <= 6; day++) {
    await prisma.workerAvailability.create({
      data: {
        worker_id: workerAlex.id,
        day_of_week: day,
        start_time: '05:00',
        end_time: '17:00',
        is_available: true,
      },
    });
  }
  await prisma.wageRate.create({
    data: {
      worker_id: workerAlex.id,
      currency: 'AUD',
      rate_type: 'hourly',
      amount: 34.00,
      overtime_multiplier: 1.5,
      effective_from: new Date('2024-01-01'),
    },
  });

  // Worker 4: Emma Taylor (RN Nurse)
  const workerEmma = await prisma.worker.create({
    data: {
      agency_id: agency.id,
      name: 'Emma Taylor',
      email: 'emma.taylor@example.com',
      phone: '+61 400 444 555',
      home_lat: -33.840,
      home_lng: 151.200,
      status: 'active',
    },
  });
  await prisma.workerSkill.create({
    data: {
      worker_id: workerEmma.id,
      skill_id: skillRN.id,
      certified_at: new Date('2024-02-01'),
      expires_at: new Date('2028-02-01'),
    },
  });
  for (let day = 1; day <= 5; day++) {
    await prisma.workerAvailability.create({
      data: {
        worker_id: workerEmma.id,
        day_of_week: day,
        start_time: '08:00',
        end_time: '18:00',
        is_available: true,
      },
    });
  }
  await prisma.wageRate.create({
    data: {
      worker_id: workerEmma.id,
      currency: 'AUD',
      rate_type: 'hourly',
      amount: 50.00,
      overtime_multiplier: 1.5,
      effective_from: new Date('2024-01-01'),
    },
  });

  // 7. Create Users
  const adminUser = await prisma.user.create({
    data: {
      agency_id: agency.id,
      email: 'admin@apexstaffing.com.au',
      password_hash: passwordHash,
      role: 'admin',
    },
  });

  const coordUser = await prisma.user.create({
    data: {
      agency_id: agency.id,
      email: 'coordinator@apexstaffing.com.au',
      password_hash: passwordHash,
      role: 'coordinator',
    },
  });

  const workerUser1 = await prisma.user.create({
    data: {
      agency_id: agency.id,
      email: 'sarah.jenkins@example.com',
      password_hash: passwordHash,
      role: 'worker',
      linked_worker_id: workerSarah.id,
    },
  });

  const workerUser2 = await prisma.user.create({
    data: {
      agency_id: agency.id,
      email: 'david.miller@example.com',
      password_hash: passwordHash,
      role: 'worker',
      linked_worker_id: workerDavid.id,
    },
  });

  const payerUser = await prisma.user.create({
    data: {
      agency_id: agency.id,
      email: 'payer@healthfirst.com.au',
      password_hash: passwordHash,
      role: 'payer_readonly',
    },
  });

  // 8. Create Bill Rates
  await prisma.billRate.create({
    data: {
      payer_id: payerHealth.id,
      client_id: clientHospital.id,
      skill_id: skillRN.id,
      currency: 'AUD',
      rate_type: 'hourly',
      amount: 78.00,
      effective_from: new Date('2024-01-01'),
    },
  });

  await prisma.billRate.create({
    data: {
      payer_id: payerHealth.id,
      client_id: clientHospital.id,
      skill_id: skillEN.id,
      currency: 'AUD',
      rate_type: 'hourly',
      amount: 62.00,
      effective_from: new Date('2024-01-01'),
    },
  });

  await prisma.billRate.create({
    data: {
      payer_id: payerLogistics.id,
      client_id: clientWarehouse.id,
      skill_id: skillForklift.id,
      currency: 'AUD',
      rate_type: 'hourly',
      amount: 52.00,
      effective_from: new Date('2024-01-01'),
    },
  });

  // 9. Sample Requirements & Shifts
  const todayStr = new Date().toISOString().split('T')[0];

  // Approved Requirement 1: St Vincent RN Nurse
  const req1 = await prisma.clientRequirement.create({
    data: {
      client_id: clientHospital.id,
      shift_date: todayStr,
      start_time: '07:00',
      end_time: '15:00',
      headcount: 2,
      status: 'approved',
      approved_by: adminUser.id,
      approved_at: new Date(),
    },
  });
  await prisma.requirementSkill.create({
    data: {
      client_requirement_id: req1.id,
      skill_id: skillRN.id,
      is_mandatory: true,
    },
  });

  // Create 2 shifts for headcount=2
  const shift1DateStart = new Date(`${todayStr}T07:00:00.000Z`);
  const shift1DateEnd = new Date(`${todayStr}T15:00:00.000Z`);

  const shift1 = await prisma.shift.create({
    data: {
      client_requirement_id: req1.id,
      slot_number: 1,
      scheduled_start: shift1DateStart,
      scheduled_end: shift1DateEnd,
      status: 'confirmed',
    },
  });

  const shift2 = await prisma.shift.create({
    data: {
      client_requirement_id: req1.id,
      slot_number: 2,
      scheduled_start: shift1DateStart,
      scheduled_end: shift1DateEnd,
      status: 'open',
    },
  });

  // Assign Sarah Jenkins to Shift 1
  const assign1 = await prisma.assignment.create({
    data: {
      shift_id: shift1.id,
      worker_id: workerSarah.id,
      status: 'confirmed',
      assigned_by: coordUser.id,
    },
  });

  // Add a TimeLog for Sarah Jenkins
  const timeLog1 = await prisma.timeLog.create({
    data: {
      assignment_id: assign1.id,
      clock_in_at: shift1DateStart,
      clock_out_at: shift1DateEnd,
      clock_in_lat: -33.8791,
      clock_in_lng: 151.2205,
      clock_out_lat: -33.8791,
      clock_out_lng: 151.2205,
      geofence_passed: true,
      status: 'approved',
      approved_by: adminUser.id,
      approved_at: new Date(),
    },
  });

  // Pending Requirement 2: Chullora Warehouse Forklift
  const req2 = await prisma.clientRequirement.create({
    data: {
      client_id: clientWarehouse.id,
      shift_date: todayStr,
      start_time: '08:00',
      end_time: '16:00',
      headcount: 1,
      status: 'pending_admin_approval',
    },
  });
  await prisma.requirementSkill.create({
    data: {
      client_requirement_id: req2.id,
      skill_id: skillForklift.id,
      is_mandatory: true,
    },
  });

  console.log('Seeding completed successfully!');
  console.log(`Agency ID: ${agency.id}`);
  console.log('Default credentials for testing:');
  console.log(' - Admin: admin@apexstaffing.com.au / Password123!');
  console.log(' - Coordinator: coordinator@apexstaffing.com.au / Password123!');
  console.log(' - Worker: sarah.jenkins@example.com / Password123!');
  console.log(' - Payer: payer@healthfirst.com.au / Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
