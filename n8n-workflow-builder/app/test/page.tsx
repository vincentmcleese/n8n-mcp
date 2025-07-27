export default function TestPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg animate-slide-in">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Next.js 14 Setup Complete! 🚀
        </h1>
        <p className="text-gray-600">
          TypeScript, Tailwind, and Radix UI are ready.
        </p>
        <div className="mt-6 p-4 bg-blue-500 text-white rounded">
          This should be blue (Tailwind test)
        </div>
      </div>
    </div>
  );
}