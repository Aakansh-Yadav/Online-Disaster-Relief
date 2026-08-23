import { PostFormPage } from '../components/PostFormPage'

export function PostNeedPage() {
  return (
    <PostFormPage
      kind="need"
      title="Post a need"
      description="Tell neighbors what you need. Your post is saved to the shared board."
      titleLabel="What do you need?"
      titlePlaceholder="e.g. Need insulin"
      detailPlaceholder="Quantity, urgency, access notes…"
      defaultCategory="Medicine"
      submitLabel="Save need"
    />
  )
}
