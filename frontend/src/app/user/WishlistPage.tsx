import { Heart } from "lucide-react"
import { Link } from "react-router"
import { Button, EmptyState, PageHeader, ProductCard } from "../components"
import { useStore } from "../store"

export function WishlistPage() {
  const { products, wishlist } = useStore()
  const items = products.filter((product) => wishlist.includes(product.id))

  return (
    <div className="container-wide py-8">
      <PageHeader
        title="Your wishlist"
        description="Save products while planning your next repair or construction project."
      />
      {items.length ? (
        <div className="product-grid">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Heart />}
          title="Your wishlist is empty"
          text="Tap the heart on a product to save it here."
          action={
            <Link to="/products">
              <Button>Discover products</Button>
            </Link>
          }
        />
      )}
    </div>
  )
}
