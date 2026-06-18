import mongoose, { Schema, Document, Types } from 'mongoose'
import type { UnitType } from '@/types'

export interface BranchDetailDocument {
  branchId: Types.ObjectId
  stockLevel: number
  buyingPrice: number
}

export interface VariantDocument {
  variantId: string
  sizeLabel?: string
  branchDetails: BranchDetailDocument[]
}

export interface ProductDocument extends Document {
  name: string
  category?: string
  unitType: UnitType
  isOpenLoose: boolean
  variants: VariantDocument[]
  createdAt: Date
  updatedAt: Date
}

const BranchDetailSchema = new Schema<BranchDetailDocument>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    stockLevel: { type: Number, default: 0 },
    buyingPrice: { type: Number, required: true }
  },
  { _id: false }
)

const VariantSchema = new Schema<VariantDocument>(
  {
    variantId: { type: String, required: true },
    sizeLabel: { type: String },
    branchDetails: { type: [BranchDetailSchema], default: [] }
  },
  { _id: false }
)

const ProductSchema = new Schema<ProductDocument>(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    unitType: {
      type: String,
      enum: ['Liquid', 'Weight', 'Fixed'],
      required: true
    },
    isOpenLoose: { type: Boolean, default: false },
    variants: { type: [VariantSchema], default: [] }
  },
  { timestamps: true }
)

ProductSchema.index({ name: 1 })
ProductSchema.index({ 'variants.branchDetails.branchId': 1 })

const Product =
  mongoose.models.Product ||
  mongoose.model<ProductDocument>('Product', ProductSchema)

export default Product
