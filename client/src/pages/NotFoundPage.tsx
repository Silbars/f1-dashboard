import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Page not found</h1>
      <Link to="/" className="text-red-400 underline">
        Back to the home page
      </Link>
    </section>
  );
}
