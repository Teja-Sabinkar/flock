'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardIndex() {
  const router = useRouter();
  
  useEffect(() => {
    router.push('/home');
  }, [router]);
  
  return <div>Redirecting...</div>;
}