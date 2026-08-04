/** Non-interactive compendium illustration for an opened item leaf. */
export function ItemArtPlate({ src }: { src: string }) {
  return (
    <div className="cmp-entry-art" aria-hidden="true">
      <img src={src} alt="" width={672} height={840} loading="lazy" decoding="async" />
    </div>
  );
}
