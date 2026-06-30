import mongoose, { Schema, Document, Types } from 'mongoose'
import type { UnitType } from '@/types'

export interface BranchDetailDocument {
  branchId: Types.ObjectId
  stockLevel: number
  buyingPrice: number
  mrpPrice: number
}

export interface VariantDocument {
  variantId: string
  sizeLabel?: string
  portionSize: number
  branchDetails: BranchDetailDocument[]
}

export interface PooledStockDocument {
  branchId: Types.ObjectId
  stockQty: number
  buyingPrice: number
}

export interface ProductDocument extends Document {
  productCode: string
  name: string
  category?: string
  unitType: UnitType
  isOpenLoose: boolean
  isPooled: boolean
  variants: VariantDocument[]
  pooledStock: PooledStockDocument[]
  createdAt: Date
  updatedAt: Date
}

const BranchDetailSchema = new Schema<BranchDetailDocument>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    stockLevel: { type: Number, default: 0 },
    buyingPrice: { type: Number, required: true },
    mrpPrice: { type: Number, default: 0 }
  },
  { _id: false }
)

const VariantSchema = new Schema<VariantDocument>(
  {
    variantId: { type: String, required: true },
    sizeLabel: { type: String },
    portionSize: { type: Number, default: 0 },
    branchDetails: { type: [BranchDetailSchema], default: [] }
  },
  { _id: false }
)

const PooledStockSchema = new Schema<PooledStockDocument>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    stockQty: { type: Number, default: 0 },
    buyingPrice: { type: Number, default: 0 }
  },
  { _id: false }
)

const ProductSchema = new Schema<ProductDocument>(
  {
    productCode: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    unitType: {
      type: String,
      enum: ['Liquid', 'Weight', 'Fixed'],
      required: true
    },
    isOpenLoose: { type: Boolean, default: false },
    isPooled: { type: Boolean, default: false },
    variants: { type: [VariantSchema], default: [] },
    pooledStock: { type: [PooledStockSchema], default: [] }
  },
  { timestamps: true }
)

ProductSchema.index({ productCode: 1 }, { unique: true })
ProductSchema.index({ name: 1 })
ProductSchema.index({ 'variants.branchDetails.branchId': 1 })
ProductSchema.index({ 'pooledStock.branchId': 1 })

const Product =
  mongoose.models.Product ||
  mongoose.model<ProductDocument>('Product', ProductSchema)

export default Product
