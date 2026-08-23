import { PostFormPage } from '../components/PostFormPage'

export function PostOfferPage() {
  return (
    <PostFormPage
      kind="offer"
      title="Post an offer"
      description="Share what you can provide — space, supplies, or a ride. Saved to the shared board."
      titleLabel="What can you offer?"
      titlePlaceholder="e.g. Space for 3 people"
      detailPlaceholder="Capacity, hours available, constraints…"
      defaultCategory="Shelter"
      submitLabel="Save offer"
    />
  )
}
