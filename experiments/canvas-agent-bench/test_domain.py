"""Negative controls for the shared service; these are not harness intelligence scores."""
import tempfile
import unittest
from pathlib import Path
from domain import Canvas


class CanvasContracts(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.path=Path(self.tmp.name)/'canvas.sqlite'
        self.canvas=Canvas(self.path)

    def tearDown(self): self.tmp.cleanup()

    def test_duplicate_submit_after_reopen_returns_same_task(self):
        args={'node_id':'shot-b','action_id':'generation-1'}
        first=self.canvas.call('submit_generation',args)
        replay=Canvas(self.path).call('submit_generation',args)
        self.assertEqual(first,replay)
        self.assertEqual(len(self.canvas.snapshot()['tasks']),1)

    def test_new_action_does_create_duplicate_negative_control(self):
        for action in ['generation-1','generation-2']:
            self.canvas.call('submit_generation',{'node_id':'shot-b','action_id':action})
        self.assertEqual(len(self.canvas.snapshot()['tasks']),2)

    def test_reused_id_with_changed_target_is_rejected(self):
        self.canvas.call('submit_generation',{'node_id':'shot-b','action_id':'same'})
        result=self.canvas.call('submit_generation',{'node_id':'shot-a','action_id':'same'})
        self.assertEqual(result['error'],'ACTION_CONFLICT')
        self.assertEqual(len(self.canvas.snapshot()['tasks']),1)

    def test_stale_patch_preserves_manual_edit(self):
        self.canvas.manual_edit()
        result=self.canvas.call('edit_node',dict(node_id='shot-b',expected_version=1,
            prompt='过期内容',ratio='9:16',action_id='stale'))
        self.assertEqual(result['error'],'VERSION_CONFLICT')
        self.assertEqual(self.canvas.snapshot()['nodes'][1]['prompt'],'用户手工修改：蓝色背景')

    def test_unknown_target_and_unsupported_ratio_do_not_mutate(self):
        before=self.canvas.snapshot()
        self.assertEqual(self.canvas.call('submit_generation',{'node_id':'another-project-node','action_id':'x'})['error'],'NODE_NOT_FOUND')
        result=self.canvas.call('edit_node',dict(node_id='shot-b',expected_version=1,
            prompt='x',ratio='unsupported',action_id='x'))
        self.assertEqual(result['error'],'UNSUPPORTED_RATIO')
        self.assertEqual(before,self.canvas.snapshot())


if __name__=='__main__': unittest.main()
