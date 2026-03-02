// components/CapsuleFeed.tsx
export default function CapsuleFeed({ photos }: { photos: { url: string, caption: string }[] }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-2xl h-[80vh] rounded-t-3xl sm:rounded-3xl p-6 overflow-y-auto">
        <div className="flex justify-between mb-4">
          <h2 className="text-xl font-bold">Unlocked Location</h2>
          <button className="text-gray-500">Close</button>
        </div>
        
        {/* Masonry Grid */}
        <div className="columns-2 gap-4 space-y-4">
          {photos.map((item, i) => (
            <div key={i} className="break-inside-avoid">
              <img src={item.url} alt="" className="w-full rounded-lg shadow-sm" />
              <p className="mt-2 text-sm text-gray-600">{item.caption}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}