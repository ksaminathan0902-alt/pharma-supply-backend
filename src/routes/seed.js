const router = require('express').Router()
const prisma = require('../utils/prisma')
const bcrypt = require('bcryptjs')

router.post('/', async (req, res) => {
  try {
    const log = []

    // Categories
    const categories = ['Medicines', 'Medical Supplies', 'Equipment', 'Consumables', 'Lab Reagents']
    const catMap = {}
    for (const name of categories) {
      let cat = await prisma.productCategory.findUnique({ where: { name } })
      if (!cat) cat = await prisma.productCategory.create({ data: { name } })
      catMap[name] = cat
    }
    log.push('Categories seeded')

    // Suppliers
    const suppliersData = [
      { name: 'Pacific Medical Supplies', contactPerson: 'John Tau', email: 'john@pacmed.com.pg', phone: '3251234', address: 'Boroko, NCD, PNG', paymentTerms: 'Net 30' },
      { name: 'PNG Pharma Distributors',  contactPerson: 'Mary Ovia', email: 'mary@pngpharma.com.pg', phone: '3255678', address: 'Waigani, NCD, PNG', paymentTerms: 'Net 15' },
    ]
    const supplierMap = {}
    for (const s of suppliersData) {
      let sup = await prisma.supplier.findFirst({ where: { name: s.name } })
      if (!sup) sup = await prisma.supplier.create({ data: s })
      supplierMap[s.name] = sup
    }
    log.push('Suppliers seeded')

    // Supplier user accounts
    const supplierUsers = [
      { name: 'Pacific Med Rep', email: 'supplier1@inventory.com', password: 'supplier123', supplierId: supplierMap['Pacific Medical Supplies'].id },
      { name: 'PNG Pharma Rep',  email: 'supplier2@inventory.com', password: 'supplier123', supplierId: supplierMap['PNG Pharma Distributors'].id },
    ]
    for (const u of supplierUsers) {
      const exists = await prisma.user.findUnique({ where: { email: u.email } })
      if (!exists) {
        const hashed = await bcrypt.hash(u.password, 10)
        await prisma.user.create({ data: { name: u.name, email: u.email, password: hashed, role: 'SUPPLIER', supplierId: u.supplierId } })
      }
    }
    log.push('Supplier user accounts seeded')

    // Products
    const productsData = [
      { name: 'Amoxicillin 500mg Capsules', sku: 'MED-001', unit: 'Box (100)', reorderLevel: 20, category: 'Medicines' },
      { name: 'Paracetamol 500mg Tablets',  sku: 'MED-002', unit: 'Box (100)', reorderLevel: 30, category: 'Medicines' },
      { name: 'Metformin 500mg Tablets',    sku: 'MED-003', unit: 'Box (100)', reorderLevel: 15, category: 'Medicines' },
      { name: 'Quinine 300mg Tablets',      sku: 'MED-004', unit: 'Box (50)',  reorderLevel: 10, category: 'Medicines' },
      { name: 'IV Cannula 18G',             sku: 'SUP-001', unit: 'Box (50)',  reorderLevel: 10, category: 'Medical Supplies' },
      { name: 'Surgical Gloves (Medium)',   sku: 'SUP-002', unit: 'Box (100)', reorderLevel: 20, category: 'Medical Supplies' },
      { name: 'Syringe 5ml',               sku: 'SUP-003', unit: 'Box (100)', reorderLevel: 15, category: 'Medical Supplies' },
      { name: 'Normal Saline 500ml',        sku: 'MED-005', unit: 'Carton (12)', reorderLevel: 10, category: 'Medicines' },
      { name: 'Surgical Mask',             sku: 'CON-001', unit: 'Box (50)',  reorderLevel: 25, category: 'Consumables' },
      { name: 'Blood Glucose Test Strips',  sku: 'LAB-001', unit: 'Box (50)',  reorderLevel: 8,  category: 'Lab Reagents' },
    ]
    for (const p of productsData) {
      const exists = await prisma.product.findUnique({ where: { sku: p.sku } })
      if (!exists) {
        const prod = await prisma.product.create({
          data: { name: p.name, sku: p.sku, unit: p.unit, reorderLevel: p.reorderLevel, categoryId: catMap[p.category].id },
        })
        await prisma.stockLevel.create({ data: { productId: prod.id, currentStock: 0 } })
      }
    }
    log.push('Products seeded')

    // Link products to suppliers with pricing
    const allProducts = await prisma.product.findMany()
    for (const prod of allProducts) {
      for (const sup of Object.values(supplierMap)) {
        const exists = await prisma.supplierProduct.findUnique({
          where: { supplierId_productId: { supplierId: sup.id, productId: prod.id } }
        })
        if (!exists) {
          await prisma.supplierProduct.create({
            data: { supplierId: sup.id, productId: prod.id, unitCost: (Math.random() * 50 + 10).toFixed(2), leadDays: 7 }
          })
        }
      }
    }
    log.push('Supplier-product links seeded')

    res.json({ success: true, log })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
