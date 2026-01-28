export default function AdminInstagramPage() {
  async function test() {
    const res = await fetch(
      "/api/admin/instagram/test?admin=" + process.env.NEXT_PUBLIC_ADMIN_SECRET
    );
    const data = await res.json();
    alert(JSON.stringify(data, null, 2));
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Instagram Admin</h1>

      <button onClick={test}>
        Test IG API
      </button>
    </div>
  );
}
