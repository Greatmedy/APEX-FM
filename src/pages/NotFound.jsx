import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center px-4 text-center pitch-bg">
      <div>
        <p className="num text-8xl text-gold">404</p>
        <p className="font-display text-2xl mt-2">Offside. That page does not exist.</p>
        <Link to="/home" className="btn btn-gold mt-6">Back to home</Link>
      </div>
    </div>
  );
}
