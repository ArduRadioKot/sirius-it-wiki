import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('schedule',Path(__file__).resolve().parents[1]/'scripts/update-schedule.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ScheduleTests(unittest.TestCase):
    def event(self,**extra):
        return dict(date='15.09.2026',startTime='08:45',endTime='10:05',discipline='Физика',group=m.GROUPS[0],teachers={},**extra)
    def test_subgroups_and_duplicate_events(self):
        a=self.event(classroom='Альфа 5.8Альфа 5.8');b=self.event(classroom='Бета 2.3')
        rows=m.normalize({'a':[a,a,b]},m.GROUPS[0]);self.assertEqual(len(rows),2);self.assertEqual(rows[0]['date'],'2026-09-15');self.assertIn('Альфа 5.8',[r['room'] for r in rows])
    def test_reject_wrong_group_and_bad_dates(self):
        a=self.event();a['group']=m.GROUPS[1]
        with self.assertRaises(ValueError):m.normalize({'a':[a]},m.GROUPS[0])
        a=self.event();a['date']='31.02.2026'
        with self.assertRaises(ValueError):m.normalize({'a':[a]},m.GROUPS[0])
    def test_empty_week(self):self.assertEqual(m.normalize([],m.GROUPS[0]),[])
if __name__=='__main__':unittest.main()
