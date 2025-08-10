import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { useWireframe } from '../contexts/WireframeContext';

export default function SidebarNav({ items = [], collapsed, setCollapsed }) {
  const { data: session } = useSession();
  const { enabled: wireframeMode, setEnabled: setWireframeMode } = useWireframe();
  const router = useRouter();

  return (
    <aside className={`hidden lg:flex lg:flex-col lg:border-r lg:border-gray-200 bg-white lg:sticky lg:top-0 lg:h-screen ${collapsed ? 'lg:w-16' : 'lg:w-64'}`} style={{ transition: 'width 200ms ease' }}>
      {/* Sidebar toggle always visible on desktop */}
      <div className={`px-2 py-2 border-b border-gray-200 flex ${collapsed ? 'justify-center' : 'justify-end'}`}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="text-gray-600 hover:text-gray-900 transition-colors"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      {!collapsed && (
        <div className='flex-1 flex flex-col overflow-hidden'>
          <nav className='flex-1 overflow-y-auto px-2 pt-5 pb-4 space-y-1'>
            {items.map((item) => {
              const isActive = router.pathname === item.href;
              return (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    className={`group flex ${collapsed ? 'justify-center' : 'items-center'} px-2 py-2 text-sm font-medium rounded-md ${
                      isActive
                        ? 'bg-gray-200 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {item.icon && (
                      <item.icon
                        className={`${collapsed ? '' : 'mr-3'} h-6 w-6 ${
                          isActive ? 'text-gray-500' : 'text-gray-400 group-hover:text-gray-500'
                        }`}
                      />
                    )}
                    {!collapsed && item.label}
                  </Link>
                  {!collapsed && item.subItems && router.pathname.startsWith(item.href) && (
                    <div className="ml-6 space-y-1">
                      {item.subItems.map((sub) => {
                        const isSubActive = router.pathname === sub.href;
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                              isSubActive
                                ? 'bg-gray-200 text-gray-900'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                          >
                            {sub.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          {/* Wireframe toggle moved here */}
          <div className={`px-2 py-2 border-t border-gray-200 flex ${collapsed ? 'justify-center' : ''}`}>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={wireframeMode}
                onChange={() => setWireframeMode(!wireframeMode)}
                className="form-checkbox h-4 w-4 text-red-500 border-gray-300 rounded"
              />
              {!collapsed && <span className="text-sm text-gray-600">Wireframe</span>}
            </label>
          </div>
          {session?.user && (
            <div className="px-2 py-4 border-t border-gray-200">
              <button
                onClick={() => signOut()}
                className="group flex items-center justify-center px-2 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-md w-full"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}