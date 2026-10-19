import { Redirect, Route, Switch } from 'wouter';
import { AdminPage } from './pages/admin/AdminPage.tsx';
import { DisplayPage } from './pages/display/DisplayPage.tsx';
import { LoginPage } from './pages/login/LoginPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { StaffPage } from './pages/staff/StaffPage.tsx';
import { TakePage } from './pages/take/TakePage.tsx';
import { TicketPage } from './pages/ticket/TicketPage.tsx';

export function App() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/take" replace />
      </Route>
      <Route path="/take" component={TakePage} />
      <Route path="/ticket/:token" component={TicketPage} />
      <Route path="/display" component={DisplayPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/staff" component={StaffPage} />
      <Route path="/admin/*?" component={AdminPage} />
      <Route component={NotFoundPage} />
    </Switch>
  );
}
