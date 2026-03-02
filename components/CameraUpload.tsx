// components/CameraUpload.tsx
export default function CameraUpload() {
  return (
    <div className="p-4 flex flex-col items-center gap-4">
      <label className="w-full max-w-xs flex flex-col items-center px-4 py-6 bg-blue-600 text-white rounded-xl shadow-lg tracking-wide cursor-pointer hover:bg-blue-700">
        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4z" />
        </svg>
        <span className="mt-2 text-base leading-normal">Take a Photo</span>
        <input 
          type="file" 
          accept="image/*" 
          capture="environment" 
          className="hidden" 
          onChange={(e) => console.log(e.target.files?.[0])}
        />
      </label>
    </div>
  );
}