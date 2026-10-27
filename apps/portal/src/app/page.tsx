import { redirect } from 'next/navigation';

// Root redirects to login — role-based routing happens after auth
export default function Home() {
  redirect('/login');
}
