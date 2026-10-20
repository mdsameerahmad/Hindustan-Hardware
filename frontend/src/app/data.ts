export type Brand = {
  id: string
  name: string
  slug: string
  logo?: string
  description: string
  supportedCategories: string[]
  active: boolean
  displayOrder: number
}

export type Product = {
  id: string
  slug: string
  name: string
  brand: string
  brandId: string
  brandName: string
  category: string
  categoryId: string
  productType: string
  price: number
  mrp?: number
  stock: number
  unit: string
  unitOfSale: string
  material: string
  size: string
  diameter: string
  length: string
  pressureRating: string
  technicalStandard: string
  intendedApplication: string
  comparisonGroupId?: string
  variantAttributes: Record<string, string>
  image: string
  images: string[]
  description: string
  featured?: boolean
  active?: boolean
  discountPercentage?: number | null
  specs: Record<string, string>
}

export type OrderStatus = "Order Placed" | "Order Confirmed" | "Preparing Your Order" | "Ready for Dispatch" | "Out for Delivery" | "Delivered" | "Cancelled"

export type Order = {
  id: string
  date: string
  status: OrderStatus
  total: number
  payment: string
  paymentStatus: string
  address: string
  items: {
    productId: string
    quantity: number
    price: number
  }[]
}

export const initialBrands: Brand[] = [
  {
    id: "ashirvad",
    name: "Ashirvad Pipes",
    slug: "ashirvad-pipes",
    description: "CPVC, UPVC and plumbing systems",
    supportedCategories: [
      "CPVC Pipes",
      "PVC Pipes",
      "UPVC Pipes",
      "Pipe Fittings",
      "Water Supply Systems",
    ],
    active: true,
    displayOrder: 1,
  },
  {
    id: "astral",
    name: "Astral Pipes",
    slug: "astral-pipes",
    description: "CPVC and water supply systems",
    supportedCategories: [
      "CPVC Pipes",
      "PVC Pipes",
      "UPVC Pipes",
      "Pipe Fittings",
      "Water Supply Systems",
    ],
    active: true,
    displayOrder: 2,
  },
  {
    id: "supreme",
    name: "Supreme Industries",
    slug: "supreme-industries",
    description: "Pipes, drainage and fittings",
    supportedCategories: [
      "CPVC Pipes",
      "PVC Pipes",
      "UPVC Pipes",
      "SWR and Drainage",
      "Pipe Fittings",
    ],
    active: true,
    displayOrder: 3,
  },
  {
    id: "finolex",
    name: "Finolex Industries",
    slug: "finolex-industries",
    description: "PVC and agricultural water pipes",
    supportedCategories: [
      "CPVC Pipes",
      "PVC Pipes",
      "UPVC Pipes",
      "Water Supply Systems",
    ],
    active: true,
    displayOrder: 4,
  },
  {
    id: "prince",
    name: "Prince Pipes and Fittings",
    slug: "prince-pipes-fittings",
    description: "Plumbing and drainage systems",
    supportedCategories: [
      "CPVC Pipes",
      "PVC Pipes",
      "UPVC Pipes",
      "SWR and Drainage",
      "Pipe Fittings",
    ],
    active: true,
    displayOrder: 5,
  },
  {
    id: "apollo",
    name: "Apollo Pipes",
    slug: "apollo-pipes",
    description: "HDPE and water supply systems",
    supportedCategories: [
      "CPVC Pipes",
      "PVC Pipes",
      "HDPE Pipes",
      "Water Supply Systems",
    ],
    active: true,
    displayOrder: 6,
  },
]

export const categories = [
  {
    name: "PVC Pipes",
    slug: "pvc-pipes",
    image:
      "https://images.unsplash.com/photo-1642797735471-3e90055c5ff9?auto=format&fit=crop&w=700&q=80",
  },
  {
    name: "UPVC & CPVC Pipes",
    slug: "upvc-cpvc-pipes",
    image:
      "https://images.unsplash.com/photo-1715322554946-1b22a9800aec?auto=format&fit=crop&w=700&q=80",
  },
  {
    name: "HDPE Pipes",
    slug: "hdpe-pipes",
    image:
      "https://images.unsplash.com/photo-1650176729290-c831770afaee?auto=format&fit=crop&w=700&q=80",
  },
  {
    name: "Water Storage Tanks",
    slug: "water-storage-tanks",
    image:
      "https://images.unsplash.com/photo-1603093433330-e0e5c30df0fe?auto=format&fit=crop&w=700&q=80",
  },
  {
    name: "Pipe Fittings",
    slug: "pipe-fittings",
    image:
      "https://images.unsplash.com/photo-1707409464203-df2f21c32b9c?auto=format&fit=crop&w=700&q=80",
  },
  {
    name: "Boring Materials",
    slug: "boring-materials",
    image:
      "https://images.unsplash.com/photo-1673870861507-d72aa6855d89?auto=format&fit=crop&w=700&q=80",
  },
  {
    name: "Water Connection Supplies",
    slug: "water-connection",
    image:
      "https://images.unsplash.com/photo-1681249537103-9e0c7316d91e?auto=format&fit=crop&w=700&q=80",
  },
  {
    name: "Valves & Taps",
    slug: "valves-taps",
    image:
      "https://images.unsplash.com/photo-1681249537103-9e0c7316d91e?auto=format&fit=crop&w=700&q=80",
  },
  {
    name: "Electrical",
    slug: "electrical",
    image:
      "https://images.unsplash.com/photo-1587534012737-1fd8a84b519e?auto=format&fit=crop&w=700&q=80",
  },
  {
    name: "Bathroom Fittings",
    slug: "bathroom-fittings",
    image:
      "https://images.unsplash.com/photo-1681249537103-9e0c7316d91e?auto=format&fit=crop&w=700&q=80",
  },
  {
    name: "Water Pumps",
    slug: "water-pumps",
    image:
      "https://images.unsplash.com/photo-1715322554946-1b22a9800aec?auto=format&fit=crop&w=700&q=80",
  },
  {
    name: "Tools & Accessories",
    slug: "tools-accessories",
    image:
      "https://images.unsplash.com/photo-1454988501794-2992f706932e?auto=format&fit=crop&w=700&q=80",
  },
]

const images = {
  pipe: "https://images.unsplash.com/photo-1642797735471-3e90055c5ff9?auto=format&fit=crop&w=900&q=80",
  pressure:
    "https://images.unsplash.com/photo-1715322554946-1b22a9800aec?auto=format&fit=crop&w=900&q=80",
  hdpe: "https://images.unsplash.com/photo-1650176729290-c831770afaee?auto=format&fit=crop&w=900&q=80",
  fitting:
    "https://images.unsplash.com/photo-1707409464203-df2f21c32b9c?auto=format&fit=crop&w=900&q=80",
  valve:
    "https://images.unsplash.com/photo-1681249537103-9e0c7316d91e?auto=format&fit=crop&w=900&q=80",
  tool: "https://images.unsplash.com/photo-1503789146722-cf137a3c0fea?auto=format&fit=crop&w=900&q=80",
  electrical:
    "https://images.unsplash.com/photo-1587534012737-1fd8a84b519e?auto=format&fit=crop&w=900&q=80",
  tank: "https://images.unsplash.com/photo-1603093433330-e0e5c30df0fe?auto=format&fit=crop&w=900&q=80",
}

type Seed = {
  id: string
  name: string
  brandId: string
  category: string
  productType: string
  price: number
  stock: number
  material: string
  diameter: string
  length: string
  unit: string
  pressure: string
  standard: string
  application: string
  group?: string
  image: string
  mrp?: number
}

const seeds: Seed[] = [
  {
    id: "p1",
    name: "CPVC Plumbing Pipe — 3/4 inch",
    brandId: "ashirvad",
    category: "UPVC & CPVC Pipes",
    productType: "CPVC Pipes",
    price: 500,
    mrp: 545,
    stock: 42,
    material: "CPVC",
    diameter: "3/4 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "SDR 11",
    standard: "IS 15778",
    application: "Hot and cold water supply",
    group: "cpvc-075-3m-sdr11",
    image: images.pressure,
  },
  {
    id: "p2",
    name: "CPVC Plumbing Pipe — 3/4 inch",
    brandId: "astral",
    category: "UPVC & CPVC Pipes",
    productType: "CPVC Pipes",
    price: 480,
    mrp: 525,
    stock: 36,
    material: "CPVC",
    diameter: "3/4 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "SDR 11",
    standard: "IS 15778",
    application: "Hot and cold water supply",
    group: "cpvc-075-3m-sdr11",
    image: images.pressure,
  },
  {
    id: "p3",
    name: "CPVC Plumbing Pipe — 3/4 inch",
    brandId: "supreme",
    category: "UPVC & CPVC Pipes",
    productType: "CPVC Pipes",
    price: 520,
    mrp: 560,
    stock: 28,
    material: "CPVC",
    diameter: "3/4 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "SDR 11",
    standard: "IS 15778",
    application: "Hot and cold water supply",
    group: "cpvc-075-3m-sdr11",
    image: images.pipe,
  },
  {
    id: "p4",
    name: "CPVC Plumbing Pipe — 3/4 inch",
    brandId: "finolex",
    category: "UPVC & CPVC Pipes",
    productType: "CPVC Pipes",
    price: 465,
    mrp: 510,
    stock: 31,
    material: "CPVC",
    diameter: "3/4 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "SDR 11",
    standard: "IS 15778",
    application: "Hot and cold water supply",
    group: "cpvc-075-3m-sdr11",
    image: images.pipe,
  },
  {
    id: "p5",
    name: "CPVC Plumbing Pipe — 3/4 inch",
    brandId: "prince",
    category: "UPVC & CPVC Pipes",
    productType: "CPVC Pipes",
    price: 495,
    mrp: 540,
    stock: 23,
    material: "CPVC",
    diameter: "3/4 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "SDR 11",
    standard: "IS 15778",
    application: "Hot and cold water supply",
    group: "cpvc-075-3m-sdr11",
    image: images.pressure,
  },
  {
    id: "p6",
    name: "CPVC Plumbing Pipe — 3/4 inch",
    brandId: "apollo",
    category: "UPVC & CPVC Pipes",
    productType: "CPVC Pipes",
    price: 450,
    mrp: 495,
    stock: 19,
    material: "CPVC",
    diameter: "3/4 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "SDR 11",
    standard: "IS 15778",
    application: "Hot and cold water supply",
    group: "cpvc-075-3m-sdr11",
    image: images.pipe,
  },
  {
    id: "p7",
    name: "PVC Plumbing Pipe — 1 inch",
    brandId: "ashirvad",
    category: "PVC Pipes",
    productType: "PVC Pipes",
    price: 285,
    stock: 84,
    material: "PVC",
    diameter: "1 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "Class 3",
    standard: "IS 4985",
    application: "Cold water plumbing",
    group: "pvc-1in-3m-class3",
    image: images.pipe,
  },
  {
    id: "p8",
    name: "PVC Plumbing Pipe — 1 inch",
    brandId: "astral",
    category: "PVC Pipes",
    productType: "PVC Pipes",
    price: 298,
    stock: 54,
    material: "PVC",
    diameter: "1 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "Class 3",
    standard: "IS 4985",
    application: "Cold water plumbing",
    group: "pvc-1in-3m-class3",
    image: images.pipe,
  },
  {
    id: "p9",
    name: "PVC Plumbing Pipe — 1 inch",
    brandId: "supreme",
    category: "PVC Pipes",
    productType: "PVC Pipes",
    price: 310,
    stock: 62,
    material: "PVC",
    diameter: "1 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "Class 3",
    standard: "IS 4985",
    application: "Cold water plumbing",
    group: "pvc-1in-3m-class3",
    image: images.pipe,
  },
  {
    id: "p10",
    name: "PVC Plumbing Pipe — 1 inch",
    brandId: "finolex",
    category: "PVC Pipes",
    productType: "PVC Pipes",
    price: 275,
    stock: 74,
    material: "PVC",
    diameter: "1 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "Class 3",
    standard: "IS 4985",
    application: "Cold water plumbing",
    group: "pvc-1in-3m-class3",
    image: images.pipe,
  },
  {
    id: "p11",
    name: "UPVC Pressure Pipe — 2 inch",
    brandId: "supreme",
    category: "UPVC & CPVC Pipes",
    productType: "UPVC Pipes",
    price: 620,
    stock: 32,
    material: "UPVC",
    diameter: "2 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "6 kg/cm²",
    standard: "IS 4985",
    application: "Pressurized water supply",
    group: "upvc-2in-3m-6kg",
    image: images.pressure,
  },
  {
    id: "p12",
    name: "UPVC Pressure Pipe — 2 inch",
    brandId: "ashirvad",
    category: "UPVC & CPVC Pipes",
    productType: "UPVC Pipes",
    price: 645,
    stock: 26,
    material: "UPVC",
    diameter: "2 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "6 kg/cm²",
    standard: "IS 4985",
    application: "Pressurized water supply",
    group: "upvc-2in-3m-6kg",
    image: images.pressure,
  },
  {
    id: "p13",
    name: "UPVC Pressure Pipe — 2 inch",
    brandId: "prince",
    category: "UPVC & CPVC Pipes",
    productType: "UPVC Pipes",
    price: 605,
    stock: 38,
    material: "UPVC",
    diameter: "2 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "6 kg/cm²",
    standard: "IS 4985",
    application: "Pressurized water supply",
    group: "upvc-2in-3m-6kg",
    image: images.pressure,
  },
  {
    id: "p14",
    name: "UPVC Pressure Pipe — 2 inch",
    brandId: "astral",
    category: "UPVC & CPVC Pipes",
    productType: "UPVC Pipes",
    price: 660,
    stock: 21,
    material: "UPVC",
    diameter: "2 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "6 kg/cm²",
    standard: "IS 4985",
    application: "Pressurized water supply",
    group: "upvc-2in-3m-6kg",
    image: images.pressure,
  },
  {
    id: "p15",
    name: "HDPE Water Supply Pipe — 32 mm",
    brandId: "apollo",
    category: "HDPE Pipes",
    productType: "HDPE Pipes",
    price: 1450,
    stock: 18,
    material: "HDPE",
    diameter: "32 mm",
    length: "25 m",
    unit: "per 25 m coil",
    pressure: "PN 6",
    standard: "IS 4984",
    application: "Water supply and irrigation",
    group: "hdpe-32mm-25m-pn6",
    image: images.hdpe,
  },
  {
    id: "p16",
    name: "HDPE Water Supply Pipe — 32 mm",
    brandId: "supreme",
    category: "HDPE Pipes",
    productType: "HDPE Pipes",
    price: 1520,
    stock: 12,
    material: "HDPE",
    diameter: "32 mm",
    length: "25 m",
    unit: "per 25 m coil",
    pressure: "PN 6",
    standard: "IS 4984",
    application: "Water supply and irrigation",
    group: "hdpe-32mm-25m-pn6",
    image: images.hdpe,
  },
  {
    id: "p17",
    name: "HDPE Water Supply Pipe — 32 mm",
    brandId: "prince",
    category: "HDPE Pipes",
    productType: "HDPE Pipes",
    price: 1485,
    stock: 15,
    material: "HDPE",
    diameter: "32 mm",
    length: "25 m",
    unit: "per 25 m coil",
    pressure: "PN 6",
    standard: "IS 4984",
    application: "Water supply and irrigation",
    group: "hdpe-32mm-25m-pn6",
    image: images.hdpe,
  },
  {
    id: "p18",
    name: "PVC Elbow Connector — 90°",
    brandId: "ashirvad",
    category: "Pipe Fittings",
    productType: "Pipe Fittings",
    price: 28,
    stock: 180,
    material: "PVC",
    diameter: "1 inch",
    length: "Not applicable",
    unit: "per piece",
    pressure: "Not specified",
    standard: "Not specified",
    application: "Direction change in plumbing",
    group: "pvc-elbow-1in-90",
    image: images.fitting,
  },
  {
    id: "p19",
    name: "PVC Elbow Connector — 90°",
    brandId: "astral",
    category: "Pipe Fittings",
    productType: "Pipe Fittings",
    price: 31,
    stock: 130,
    material: "PVC",
    diameter: "1 inch",
    length: "Not applicable",
    unit: "per piece",
    pressure: "Not specified",
    standard: "Not specified",
    application: "Direction change in plumbing",
    group: "pvc-elbow-1in-90",
    image: images.fitting,
  },
  {
    id: "p20",
    name: "PVC Elbow Connector — 90°",
    brandId: "prince",
    category: "Pipe Fittings",
    productType: "Pipe Fittings",
    price: 27,
    stock: 155,
    material: "PVC",
    diameter: "1 inch",
    length: "Not applicable",
    unit: "per piece",
    pressure: "Not specified",
    standard: "Not specified",
    application: "Direction change in plumbing",
    group: "pvc-elbow-1in-90",
    image: images.fitting,
  },
  {
    id: "p21",
    name: "PVC Tee Connector — 1 inch",
    brandId: "supreme",
    category: "Pipe Fittings",
    productType: "Pipe Fittings",
    price: 35,
    stock: 140,
    material: "PVC",
    diameter: "1 inch",
    length: "Not applicable",
    unit: "per piece",
    pressure: "Not specified",
    standard: "Not specified",
    application: "Branch plumbing connection",
    image: images.fitting,
  },
  {
    id: "p22",
    name: "Brass Ball Valve — 1 inch",
    brandId: "ashirvad",
    category: "Valves & Taps",
    productType: "Valves",
    price: 475,
    stock: 24,
    material: "Brass",
    diameter: "1 inch",
    length: "Not applicable",
    unit: "per piece",
    pressure: "Not specified",
    standard: "Not specified",
    application: "Flow isolation",
    image: images.valve,
  },
  {
    id: "p23",
    name: "Triple Layer Water Tank — 1000 L",
    brandId: "supreme",
    category: "Water Storage Tanks",
    productType: "Water Storage Tanks",
    price: 5850,
    stock: 9,
    material: "LLDPE",
    diameter: "Not applicable",
    length: "Not applicable",
    unit: "per tank",
    pressure: "Not applicable",
    standard: "Not specified",
    application: "Overhead water storage",
    image: images.tank,
  },
  {
    id: "p24",
    name: "Borewell Casing Pipe — 4 inch",
    brandId: "apollo",
    category: "Boring Materials",
    productType: "Borewell and Water Supply Pipes",
    price: 1190,
    stock: 21,
    material: "UPVC",
    diameter: "4 inch",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "Not specified",
    standard: "IS 12818",
    application: "Borewell casing",
    image: images.pressure,
  },
  {
    id: "p25",
    name: "SWR Drainage Pipe — 110 mm",
    brandId: "prince",
    category: "PVC Pipes",
    productType: "SWR and Drainage",
    price: 860,
    stock: 19,
    material: "UPVC",
    diameter: "110 mm",
    length: "3 m",
    unit: "per 3 m length",
    pressure: "Non-pressure",
    standard: "IS 13592",
    application: "Soil, waste and rainwater drainage",
    image: images.pipe,
  },
  {
    id: "p26",
    name: "Agricultural PVC Pipe — 3 inch",
    brandId: "finolex",
    category: "PVC Pipes",
    productType: "Agricultural Pipes",
    price: 980,
    stock: 17,
    material: "PVC",
    diameter: "3 inch",
    length: "6 m",
    unit: "per 6 m length",
    pressure: "4 kg/cm²",
    standard: "IS 4985",
    application: "Agricultural irrigation",
    image: images.pipe,
  },
  {
    id: "p27",
    name: "Modular 6A Electrical Socket",
    brandId: "unbranded-electrical",
    category: "Electrical",
    productType: "Electrical Sockets",
    price: 165,
    stock: 66,
    material: "Polycarbonate",
    diameter: "Not applicable",
    length: "Not applicable",
    unit: "per piece",
    pressure: "Not applicable",
    standard: "Not specified",
    application: "Electrical installation",
    image: images.electrical,
  },
  {
    id: "p28",
    name: "PVC Solvent Cement — 200 ml",
    brandId: "ashirvad",
    category: "Water Connection Supplies",
    productType: "Solvent Cement",
    price: 145,
    stock: 73,
    material: "Solvent",
    diameter: "Not applicable",
    length: "Not applicable",
    unit: "per 200 ml tin",
    pressure: "Not applicable",
    standard: "Not specified",
    application: "PVC jointing",
    image: images.fitting,
  },
  {
    id: "p29",
    name: "Adjustable Pipe Wrench — 14 inch",
    brandId: "unbranded-tools",
    category: "Tools & Accessories",
    productType: "Plumbing Tools",
    price: 780,
    stock: 13,
    material: "Forged steel",
    diameter: "Not applicable",
    length: "14 inch",
    unit: "per piece",
    pressure: "Not applicable",
    standard: "Not specified",
    application: "Pipe installation",
    image: images.tool,
  },
  {
    id: "p30",
    name: "Chrome Basin Faucet",
    brandId: "unbranded-bath",
    category: "Bathroom Fittings",
    productType: "Bathroom Fittings",
    price: 1290,
    stock: 15,
    material: "Brass",
    diameter: "15 mm",
    length: "Not applicable",
    unit: "per piece",
    pressure: "Not specified",
    standard: "Not specified",
    application: "Bathroom basin",
    image: images.valve,
  },
]

export const initialProducts: Product[] = seeds.map((seed, index) => {
  const brand = initialBrands.find((item) => item.id === seed.brandId)
  const brandName = brand?.name ?? "StoreSelect"
  const slug = `${brand?.slug ?? seed.brandId}-${seed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`
  return {
    id: seed.id,
    slug,
    name: seed.name,
    brand: brandName,
    brandId: seed.brandId,
    brandName,
    category: seed.category,
    categoryId: seed.category.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    productType: seed.productType,
    price: seed.price,
    mrp: seed.mrp,
    stock: seed.stock,
    unit: seed.unit,
    unitOfSale: seed.unit,
    material: seed.material,
    size: seed.diameter,
    diameter: seed.diameter,
    length: seed.length,
    pressureRating: seed.pressure,
    technicalStandard: seed.standard,
    intendedApplication: seed.application,
    comparisonGroupId: seed.group,
    variantAttributes: {
      Diameter: seed.diameter,
      Length: seed.length,
      Material: seed.material,
    },
    image: seed.image,
    images: [seed.image],
    description: `${brandName} ${seed.name.toLowerCase()} for ${seed.application.toLowerCase()}. All pricing and availability are editable demo data.`,
    featured: index < 12,
    active: true,
    specs: {
      Material: seed.material,
      Diameter: seed.diameter,
      Length: seed.length,
      "Pressure rating": seed.pressure,
      "Technical standard": seed.standard,
      Application: seed.application,
      "Unit of sale": seed.unit,
    },
  }
})

export const initialOrders: Order[] = [
  {
    id: "HH-240318",
    date: "18 Mar 2026",
    status: "Out for Delivery",
    total: 1539,
    payment: "Cash on Delivery",
    paymentStatus: "Pending",
    address: "P.G. Road, Jehanabad, Bihar 804408",
    items: [
      { productId: "p1", quantity: 2, price: 500 },
      { productId: "p22", quantity: 1, price: 475 },
    ],
  },
  {
    id: "HH-240311",
    date: "11 Mar 2026",
    status: "Delivered",
    total: 5850,
    payment: "UPI (Demo)",
    paymentStatus: "Paid",
    address: "Kako Road, Jehanabad, Bihar",
    items: [{ productId: "p23", quantity: 1, price: 5850 }],
  },
  {
    id: "HH-240306",
    date: "06 Mar 2026",
    status: "Preparing Your Order",
    total: 2380,
    payment: "Cash on Delivery",
    paymentStatus: "Pending",
    address: "Court Area, Jehanabad, Bihar",
    items: [{ productId: "p24", quantity: 2, price: 1190 }],
  },
  {
    id: "HH-240228",
    date: "28 Feb 2026",
    status: "Order Confirmed",
    total: 1320,
    payment: "UPI (Demo)",
    paymentStatus: "Paid",
    address: "Station Road, Jehanabad, Bihar",
    items: [{ productId: "p27", quantity: 8, price: 165 }],
  },
  {
    id: "HH-240214",
    date: "14 Feb 2026",
    status: "Cancelled",
    total: 1450,
    payment: "Online (Demo)",
    paymentStatus: "Refund simulated",
    address: "Arwal More, Jehanabad, Bihar",
    items: [{ productId: "p15", quantity: 1, price: 1450 }],
  },
  {
    id: "HH-240202",
    date: "02 Feb 2026",
    status: "Ready for Dispatch",
    total: 2340,
    payment: "Cash on Delivery",
    paymentStatus: "Pending",
    address: "Ghosi, Jehanabad, Bihar",
    items: [{ productId: "p29", quantity: 3, price: 780 }],
  },
]

export const orderStages: OrderStatus[] = [
  "Order Placed",
  "Order Confirmed",
  "Preparing Your Order",
  "Ready for Dispatch",
  "Out for Delivery",
  "Delivered",
]
